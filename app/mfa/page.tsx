import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { MfaControls } from "@/components/forms";
import { logout } from "@/app/actions";
import { session } from "@/lib/session";
export default async function Mfa() {
  const current=await session();
  if(!current) redirect("/login");
  if(current.profile.role==="MEMBER") redirect("/member");
  const {data}=await current.db.auth.mfa.listFactors();
  return <AuthFrame title="Two-factor authentication" description="Protect your administrator account with an authenticator app."><MfaControls factors={data?.totp??[]}/><form action={logout}><button className="text-link">Sign out</button></form></AuthFrame>;
}
