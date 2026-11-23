import { createHash, createHmac, randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "./model";
import { checkPassword, hashPassword } from "./passwords";

export type FinanceIdentity = {
  session_id: string;
  id: string;
  name: string;
  role: Role;
  username: string;
  aal: "aal1" | "aal2";
  must_change_password: boolean;
  totp_enabled: boolean;
};
const settings = { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false };

export function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const signingKey = process.env.SUPABASE_JWT_SECRET;
  return url && key && serviceKey && signingKey ? { url,key,serviceKey,signingKey } : null;
}

function requireConfiguration() {
  const config=configuration();
  if (!config) throw new Error("Configure the Supabase database keys to continue.");
  return config;
}

export function serviceDatabase() {
  const {url,serviceKey}=requireConfiguration();
  return createClient(url,serviceKey,{auth:settings});
}

export function financeToken(identity: Pick<FinanceIdentity,"id"|"session_id"|"aal">) {
  const {signingKey}=requireConfiguration();
  const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString("base64url");
  const now=Math.floor(Date.now()/1000);
  const payload=encode({alg:"HS256",typ:"JWT"})+"."+encode({
    iss:"supabase",aud:"authenticated",role:"authenticated",sub:identity.id,
    nusha_session_id:identity.session_id,aal:identity.aal,iat:now,exp:now+300,
  });
  return payload+"."+createHmac("sha256",signingKey).update(payload).digest("base64url");
}

export function databaseFor(identity: FinanceIdentity) {
  const {url,key}=requireConfiguration();
  const token=financeToken(identity);
  return createClient(url,key,{accessToken:async()=>token});
}

export const digestToken=(token:string)=>createHash("sha256").update(token).digest("hex");

export async function authOperation<T>(db:SupabaseClient,operation:string,p:Record<string,unknown>) {
  const {data,error}=await db.rpc("finance_auth",{operation,p});
  if(error) throw new Error(error.message);
  return data as T|null;
}

export async function authenticate(db:SupabaseClient,username:string,password:string,attemptKey:string) {
  const entry=await authOperation<{id?:string;password_hash?:string;limited?:boolean}>(db,"lookup",{
    username,attempt_key:digestToken(attemptKey),
  });
  if(entry?.limited)return {state:"limited"} as const;
  const accepted=await checkPassword(password,entry?.password_hash);
  if(!accepted||!entry?.id||!entry.password_hash)return {state:"denied"} as const;

  const token=randomBytes(32).toString("base64url");
  const started=await authOperation<{id:string}>(db,"session_start",{
    id:entry.id,token_hash:digestToken(token),verified_hash:entry.password_hash,
    password_hash:entry.password_hash.startsWith("$2")?await hashPassword(password):undefined,
  });
  if(!started)return {state:"denied"} as const;
  const identity=await authOperation<FinanceIdentity>(db,"session_get",{token_hash:digestToken(token)});
  if(!identity)return {state:"denied"} as const;
  return {state:"signed_in",token,identity} as const;
}
