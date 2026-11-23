import { ActionForm, Field } from "@/components/forms";
import { AuthFrame } from "@/components/auth-frame";
import { changePassword, requestReset } from "@/app/actions";
import { one } from "@/lib/model";
import type { Params } from "@/components/primitives";
export default async function Reset({searchParams}:{searchParams:Promise<Params>}) {
  const update=one(await searchParams,"mode")==="update";
  return <AuthFrame title={update?"Set your password":"Reset your password"} description={update?"Choose a password with at least 12 characters.":"We’ll send a password reset link to your account email."} back>
    <ActionForm action={update?changePassword:requestReset} submit={update?"Save password":"Send reset link"}>{update?<><Field label="New password" name="password" type="password" required/><Field label="Confirm password" name="confirm" type="password" required/></>:<Field label="Email address" name="email" type="email" required/>}</ActionForm>
  </AuthFrame>;
}
