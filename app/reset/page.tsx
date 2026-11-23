import { ActionForm, Field } from "@/components/forms";
import { AuthFrame } from "@/components/auth-frame";
import { changePassword, logout } from "@/app/actions";
import { session } from "@/lib/session";

export default async function Reset() {
  const current=await session();
  if(!current?.profile.must_change_password) {
    return <AuthFrame title="Reset your password" description="Members can ask a union officer for a temporary password. Officers can recover their accounts with the administrator setup command." back/>;
  }

  return <AuthFrame title="Set your password" description="Enter a new password with at least 12 characters.">
    <ActionForm action={changePassword} submit="Save password">
      <Field label="New password" name="password" type="password" autoComplete="new-password" required/>
      <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" required/>
    </ActionForm>
    <form action={logout}><button className="text-link">Sign out</button></form>
  </AuthFrame>;
}
