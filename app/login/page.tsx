import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field } from "@/components/forms";
import { AuthFrame } from "@/components/auth-frame";
import { login } from "@/app/actions";
import { session } from "@/lib/session";
import { configuration } from "@/lib/supabase";
import { one } from "@/lib/model";
import type { Params } from "@/components/primitives";
export default async function Login({searchParams}:{searchParams:Promise<Params>}) {
  if (!configuration()) redirect("/setup");
  const current=await session();
  const notice=one(await searchParams,"notice");
  if(current?.profile.role==="MEMBER"&&current.member) redirect("/member");
  if(current&&current.profile.role!=="MEMBER") redirect("/admin");
  return <AuthFrame title="Sign in" description="Use your NUSHA Finance account to continue.">
    {notice&&<p className="feedback">{notice==="password"?"Password updated. Sign in with your new password.":notice==="inactive"?"Your membership is inactive. Contact a union officer.":"This link has expired. Request a new link."}</p>}
    <ActionForm action={login} submit="Sign in"><Field label="Email address" name="email" type="email" required placeholder="name@example.com"/><Field label="Password" name="password" type="password" required placeholder="Enter your password"/></ActionForm>
    <Link className="text-link" href="/reset">Forgot password?</Link>
  </AuthFrame>;
}
