import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { configuration, database } from "./supabase";
import type { Role } from "./model";

export const session = cache(async () => {
  if (!configuration()) return null;
  const db = await database();
  const { data: auth } = await db.auth.getClaims();
  const id = auth?.claims.sub;
  if (!id) return null;
  const { data } = await db.from("users").select("id,name,role").eq("id",id).maybeSingle();
  if (!data) return null;
  const profile = data as { id: string; name: string; role: Role };
  const { data: member } = profile.role === "MEMBER" ? await db.from("members").select("id,email").eq("user_id",id).maybeSingle() : { data: null };
  const { data: access } = profile.role !== "MEMBER" ? await db.rpc("finance_admin_access") : { data: false };
  return { db, profile, member, admin: access === true };
});

export async function requirePortal(area: "admin" | "member") {
  const current = await session();
  if (!current) redirect(configuration() ? "/login" : "/setup");
  if (area === "admin") {
    if (current.profile.role === "MEMBER") redirect("/member");
    if (!current.admin) redirect("/mfa");
  } else {
    if (current.profile.role !== "MEMBER") redirect("/admin");
    if (!current.member) redirect("/login?notice=inactive");
  }
  return current;
}
