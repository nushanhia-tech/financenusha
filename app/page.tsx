import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { configuration } from "@/lib/supabase";

export default async function Home() {
  const current=await session();
  redirect(current?(current.profile.role==="MEMBER"?"/member":"/admin"):(configuration()?"/login":"/setup"));
}
