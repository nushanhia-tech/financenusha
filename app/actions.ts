"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOperation, authenticate, configuration, databaseFor, serviceDatabase } from "@/lib/finance-auth";
import { hashPassword } from "@/lib/passwords";
import { clearSessionCookie, session, sessionDigest, setSessionCookie } from "@/lib/session";
import { authInput, commands, newPassword, parseCsv, trustedFileType, type Command } from "@/lib/validation";

export type ActionResult = { error?: string; message?: string; id?: string; username?: string; temporaryPassword?: string };
const privateKinds = new Set<Command>(["profile_update","proof_submit","notification_read"]);
const rpcError = (error: { message: string; code?: string }) => {
  if (error.code === "23505") return "A record with the same name, reference, or approval already exists.";
  if (error.code === "23503") return "A selected record is unavailable.";
  if (error.code === "23P01") return "This academic year overlaps an existing period.";
  if (error.code === "42501") return "Your current account cannot perform this action.";
  if (error.code === "P0002") return "The selected record could not be found.";
  if (error.code && /^22|^23|^42|^PGRST/.test(error.code)) {
    console.error("Finance command error", error.code, error.message);
    return "Check the selected values and try again.";
  }
  return error.message;
};

export async function mutate(command: Command, _previous: ActionResult, form: FormData): Promise<ActionResult> {
  const current = await session();
  if (!current) return { error:"Sign in to continue." };
  if (!Object.hasOwn(commands,command) || (!privateKinds.has(command) && !current.admin)) return { error:"Access denied." };
  if (["proof_submit","profile_update"].includes(command) && !current.member) return { error:"An active member account is required." };
  const raw: Record<string, unknown> = Object.fromEntries(form);
  let uploaded: string | undefined;
  try {
    if (command === "member_import" || command === "reconcile") {
      const source = raw.csv instanceof File ? await raw.csv.text() : String(raw.csv || "");
      const rows = parseCsv(source);
      if (command === "member_import") {
        if (rows[0]?.slice(0,2).map(v=>v.toLowerCase()).join(",") !== "name,email") return { error:"Use the CSV header name,email,phone." };
        raw.rows = rows.slice(1).map(([name,email,phone])=>({name,email,phone}));
      } else {
        if (rows.length && rows[0]?.map(v=>v.toLowerCase()).join(",") !== "reference,amount") return { error:"Use the CSV header reference,amount." };
        raw.lines = rows.slice(1).map(([reference,amount])=>({reference,amount}));
      }
    }
    const file = raw.file;
    let mime: string | null = null;
    if (command === "document_add" || command === "proof_submit") {
      if (!(file instanceof File) || file.size < 1 || file.size > 4*1024*1024) return { error:"Choose a PDF or image up to 4 MB." };
      mime = trustedFileType(new Uint8Array(await file.slice(0,16).arrayBuffer()));
      if (!mime) return { error:"Choose a PDF, PNG, JPEG, or WebP file." };
      raw.object_path = current.profile.id + "/" + crypto.randomUUID();
      raw.file_name = file.name;
    }
    const parsed = commands[command].safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const label = issue.path.join(" ").replaceAll("_"," ");
      return { error: (label ? label.charAt(0).toUpperCase()+label.slice(1)+" · " : "") + issue.message };
    }
    if (mime && file instanceof File) {
      const path = String(raw.object_path);
      const storage = current.db.storage.from("finance-documents");
      const { error } = await storage.upload(path,file,{contentType:mime,upsert:false,cacheControl:"0"});
      if (error) return { error:"The attachment could not be uploaded." };
      uploaded = path;
    }
    if (command==="member_login_create" || command==="member_login_reset") {
      const password=randomBytes(15).toString("base64url");
      const {data:username,error}=await current.db.rpc("finance_member_password",{
        member_id:String(raw.id),
        password_hash:await hashPassword(password),
        replace_existing:command==="member_login_reset",
      });
      if(error)return {error:rpcError(error)};
      revalidatePath("/admin/members");
      return {message:command==="member_login_create"?"Member login created.":"Temporary password created.",username,temporaryPassword:password};
    }
    const { data, error } = await current.db.rpc("finance_command",{command,p:parsed.data});
    if (error) {
      if (uploaded) await current.db.storage.from("finance-documents").remove([uploaded]);
      return { error:rpcError(error) };
    }
    revalidatePath("/admin","layout");
    revalidatePath("/member","layout");
    const messages: Partial<Record<Command,string>> = {
      proof_submit:"Payment proof submitted for review.", transaction_save:"Transaction draft saved.", transaction_post:"Transaction posted.",
      year_close:"Academic year closed.", year_activate:"Active academic year updated.", notification_read:"Notifications marked as read.",
      transaction_reverse:"Reversal created and submitted.", transaction_submit:"Transaction submitted.", proof_review:"Payment proof review saved.",
    };
    return {message:messages[command] ?? "Changes saved.",id: typeof data === "string" ? data : undefined};
  } catch (error) {
    if (uploaded) await current.db.storage.from("finance-documents").remove([uploaded]);
    return {error:error instanceof Error ? error.message : "The request could not be completed."};
  }
}

export async function login(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  if(!configuration())return {error:"Configure the finance database to sign in."};
  const input=authInput.safeParse(Object.fromEntries(form));
  const failure={error:"The username or password could not be verified."};
  if(!input.success)return failure;
  const requestHeaders=await headers();
  const ip=requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()||"local";
  const db=serviceDatabase();
  const result=await authenticate(db,input.data.username,input.data.password,ip);
  if(result.state==="limited")return {error:"Too many attempts. Try again later."};
  if(result.state!=="signed_in")return failure;

  const previous=await sessionDigest();
  if(previous)await authOperation(db,"session_end",{token_hash:previous});
  await setSessionCookie(result.token);
  if(result.identity.must_change_password)redirect("/reset");
  await databaseFor(result.identity).rpc("finance_command",{command:"login"});
  redirect(result.identity.role==="MEMBER"?"/member":"/admin");
}

export async function logout() {
  const tokenHash=await sessionDigest();
  try {
    if(tokenHash&&configuration())await authOperation(serviceDatabase(),"session_end",{token_hash:tokenHash});
  } finally {
    await clearSessionCookie();
  }
  redirect("/login");
}

export async function changePassword(_previous: ActionResult,form: FormData): Promise<ActionResult> {
  const current=await session();
  if(!current?.profile.must_change_password)return {error:"Sign in with your temporary password first."};
  const input=newPassword.safeParse(form.get("password"));
  if(!input.success)return {error:input.error.issues[0].message};
  if(input.data!==form.get("confirm"))return {error:"The passwords do not match."};
  const db=serviceDatabase();
  const changed=await authOperation(db,"password_change",{
    token_hash:current.tokenHash,password_hash:await hashPassword(input.data),
  });
  if(!changed)return {error:"Sign in again with your current temporary password."};
  await clearSessionCookie();
  redirect("/login?notice=password");
}
