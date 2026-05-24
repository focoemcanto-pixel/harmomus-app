import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();
  if (!context.profile || !context.ministry || !isMinistryManager(context)) return NextResponse.redirect(new URL("/ministerio", request.url));

  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const role = String(form.get("role") ?? "member");
  if (!email || !["member", "manager"].includes(role)) return NextResponse.redirect(new URL("/ministerio", request.url));

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const supabase = (await createClient()) as any;
  await supabase.from("ministry_invites").insert({ ministry_id: context.ministry.ministryId, email, role, token, invited_by: context.profile.id, expires_at: expiresAt });

  // envio de e-mail real é feito por worker assíncrono observando ministry_invites
  return NextResponse.redirect(new URL("/ministerio", request.url));
}
