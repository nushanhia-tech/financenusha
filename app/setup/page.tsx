import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { logout } from "@/app/actions";
import { configuration } from "@/lib/supabase";

export default async function Setup({searchParams}:{searchParams:Promise<{notice?:string}>}) {
  if(configuration()) {
    if((await searchParams).notice!=="database-update")redirect("/login");
    return <AuthFrame title="Administrator access unavailable" description="If this installation was just upgraded, apply the latest Supabase migration and try signing in again.">
      <p className="form-help"><code>202611230007_password_only_sign_in.sql</code></p>
      <form action={logout}><button className="text-link">Sign out</button></form>
    </AuthFrame>;
  }
  return <AuthFrame title="Connect NUSHA Finance" description="This installation needs a Supabase project before users can sign in.">
    <ol className="setup-list"><li>Apply the migrations in <code>supabase/migrations</code>.</li><li>Set the Supabase database URL, API keys and JWT signing secret in the deployment environment.</li><li>Create the first administrator username using the README.</li></ol>
  </AuthFrame>;
}
