"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appOrigin, configuration, database, privilegedAuth } from "@/lib/supabase";
import { session } from "@/lib/session";
import { authInput, commands, newPassword, parseCsv, resetEmail, trustedFileType, type Command } from "@/lib/validation";

export type ActionResult = { error?: string; message?: string; id?: string; qr?: string; secret?: string; factor?: string };
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
    if (command === "member_invite") {
      const memberId = String(raw.id);
      const { data: member } = await current.db.from("members").select("id,email,active,user_id").eq("id",memberId).maybeSingle();
      if (!member?.active || member.user_id) return {error:"Select an active member without a linked login."};
      const admin = privilegedAuth();
      const { data, error } = await admin.auth.admin.inviteUserByEmail(member.email,{redirectTo:appOrigin()+"/auth/callback"});
      if (error || !data.user) return {error:error?.message ?? "The invitation could not be issued."};
      const { error: linkError } = await admin.rpc("link_member_login",{ member_id: member.id, user_id:data.user.id,requested_by:current.profile.id });
      if (linkError) {
        await admin.auth.admin.deleteUser(data.user.id);
        return {error:rpcError(linkError)};
      }
      revalidatePath("/admin/members");
      return {message:"Member invitation sent."};
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
  if (!configuration()) return {error:"Configure Supabase to sign in."};
  const input = authInput.safeParse(Object.fromEntries(form));
  if (!input.success) return {error:"Enter a valid email and password."};
  const db = await database();
  const { data, error } = await db.auth.signInWithPassword(input.data);
  if (error || !data.user) return {error:error?.status===429 ? "Too many attempts. Try again later." : "The email or password could not be verified."};
  const {data:profile} = await db.from("users").select("role").eq("id",data.user.id).maybeSingle();
  if (!profile) { await db.auth.signOut(); return {error:"This account has no active NUSHA Finance profile."}; }
  await db.rpc("finance_command",{command:"login"});
  redirect(profile.role==="MEMBER" ? "/member" : "/admin");
}

export async function logout() {
  if (configuration()) await (await database()).auth.signOut();
  redirect("/login");
}

export async function requestReset(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const input = resetEmail.safeParse(Object.fromEntries(form));
  if (!input.success) return {error:"Enter a valid email."};
  if (!configuration()) return {error:"Configure Supabase first."};
  await (await database()).auth.resetPasswordForEmail(input.data.email,{redirectTo:appOrigin()+"/auth/callback"});
  return {message:"If the account exists, a password reset email will arrive shortly."};
}

export async function changePassword(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const input = newPassword.safeParse(form.get("password"));
  if (!input.success) return {error:input.error.issues[0].message};
  if (input.data!==form.get("confirm")) return {error:"The passwords do not match."};
  const db = await database();
  const {error} = await db.auth.updateUser({password:input.data});
  if (error) return {error:"Open a current reset or invitation link and try again."};
  await db.auth.signOut();
  redirect("/login?notice=password");
}

export async function enrollFactor(): Promise<ActionResult> {
  const current = await session();
  if (!current || current.profile.role==="MEMBER") return {error:"Administrator account required."};
  const {data,error} = await current.db.auth.mfa.enroll({factorType:"totp",friendlyName:"NUSHA Finance"});
  return error || !data ? {error:error?.message ?? "Could not start MFA setup."} : {factor:data.id,qr:data.totp.qr_code,secret:data.totp.secret};
}

export async function verifyFactor(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const current = await session();
  if (!current || current.profile.role==="MEMBER") return {error:"Administrator account required."};
  const code = String(form.get("code") || "");
  const factorId = String(form.get("factor") || "");
  if (!/^\d{6}$/.test(code) || !/^[\da-f-]{36}$/i.test(factorId)) return {error:"Enter the six-digit authenticator code."};
  const {error} = await current.db.auth.mfa.challengeAndVerify({factorId,code});
  if (error) return {error:"The authenticator code could not be verified."};
  redirect("/admin");
}
