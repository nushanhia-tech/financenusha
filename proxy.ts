import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const base = { request };
  let response = NextResponse.next(base);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(entries) {
        for (const { name, value } of entries) request.cookies.set(name, value);
        response = NextResponse.next(base);
        for (const { name, value, options } of entries) response.cookies.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
      },
    },
  });
  if (request.cookies.getAll().some(cookie => cookie.name.startsWith("sb-"))) await client.auth.getClaims();
  return response;
}
export const config = { matcher: ["/admin/:path*","/member/:path*","/api/download/:path*","/login","/mfa","/reset","/"] };
