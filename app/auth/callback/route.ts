import { NextResponse } from "next/server";
import { appOrigin, configuration, database } from "@/lib/supabase";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const code = params.get("code");
  const token_hash = params.get("token_hash");
  const type = params.get("type");
  if (configuration()) {
    const db=await database();
    if (token_hash && (type==="invite" || type==="recovery")) {
      const {error}=await db.auth.verifyOtp({token_hash,type});
      if(!error) return NextResponse.redirect(appOrigin()+"/reset?mode=update");
    }
    if (code) {
      const {error}=await db.auth.exchangeCodeForSession(code);
      if(!error) return NextResponse.redirect(appOrigin()+"/reset?mode=update");
    }
  }
  return NextResponse.redirect(appOrigin()+"/login?notice=expired");
}
