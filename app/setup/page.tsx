import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { configuration } from "@/lib/supabase";

export default function Setup() {
  if(configuration())redirect("/login");
  return <AuthFrame title="Connect NUSHA Finance" description="This installation needs a Supabase project before users can sign in.">
    <ol className="setup-list"><li>Apply the migrations in <code>supabase/migrations</code>.</li><li>Set the Supabase database URL, API keys and JWT signing secret in the deployment environment.</li><li>Create the first administrator username using the README.</li></ol>
  </AuthFrame>;
}
