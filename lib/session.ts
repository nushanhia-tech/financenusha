import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appOrigin } from "./supabase";
import { authOperation, configuration, databaseFor, digestToken, serviceDatabase, type FinanceIdentity } from "./finance-auth";

const cookieName="nusha_session";

export async function sessionDigest() {
  const cookie=(await cookies()).get(cookieName)?.value;
  return cookie && /^[\w-]{43}$/.test(cookie)?digestToken(cookie):null;
}

export async function setSessionCookie(token:string) {
  (await cookies()).set(cookieName,token,{
    httpOnly:true,secure:appOrigin().startsWith("https://"),sameSite:"lax",path:"/",maxAge:8*60*60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(cookieName);
}

export const session=cache(async()=>{
  if(!configuration())return null;
  const tokenHash=await sessionDigest();
  if(!tokenHash)return null;
  const profile=await authOperation<FinanceIdentity>(serviceDatabase(),"session_get",{token_hash:tokenHash});
  if(!profile)return null;

  const db=databaseFor(profile);
  if(profile.must_change_password)return {db,profile,member:null,admin:false,tokenHash};
  const {data:member}=profile.role==="MEMBER"?await db.from("members").select("id,email").eq("user_id",profile.id).maybeSingle():{data:null};
  const {data:access}=profile.role!=="MEMBER"?await db.rpc("finance_admin_access"):{data:false};
  return {db,profile,member,admin:access===true,tokenHash};
});

export async function requirePortal(area:"admin"|"member") {
  const current=await session();
  if(!current)redirect(configuration()?"/login":"/setup");
  if(current.profile.must_change_password)redirect("/reset");
  if(area==="admin") {
    if(current.profile.role==="MEMBER")redirect("/member");
    if(!current.admin)redirect("/mfa");
  } else {
    if(current.profile.role!=="MEMBER")redirect("/admin");
    if(!current.member)redirect("/login?notice=inactive");
  }
  return current;
}
