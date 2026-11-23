import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key ? { url, key } : null;
}
export async function database() {
  const config = configuration();
  if (!config) throw new Error("Set the Supabase URL and publishable key.");
  const jar = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(entries) {
        try {
          for (const { name, value, options } of entries) jar.set(name, value, { ...options, httpOnly: true, sameSite: "lax" });
        } catch { /* The proxy refreshes cookies for Server Component reads. */ }
      },
    },
  });
}
export function privilegedAuth() {
  const config = configuration();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !key) throw new Error("The server-side Supabase invitation key is missing.");
  return createClient(config.url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function appOrigin() {
  const url = process.env.APP_ORIGIN;
  if (!url) return "http://localhost:3000";
  return new URL(url).origin;
}
