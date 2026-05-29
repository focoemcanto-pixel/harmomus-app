import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url, 303);
}

function cleanEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryManager(context)) {
    return redirectToMinisterio(request, "Você não possui permissão para convidar integrantes.");
  }

  const form = await request.formData();
  const resendMemberId = String(form.get("resend_member_id") ?? "").trim();
  const admin = createSupabaseAdminClient() as any;

  if (resendMemberId) {
    const token = randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    const { error } = await admin
      .from("ministry_members")
      .update({ invite_token: token, invited_at: now, invited_by: context.profile.id, updated_at: now })
      .eq("id", resendMemberId)
      .eq("ministry_id", context.ministry.ministryId)
      .in("status", ["pending", "invited"]);

    if (error) return redirectToMinisterio(request, error.message || "Não foi possível reenviar o convite.");
    return redirectToMinisterio(request, "Convite reenviado com sucesso.");
  }

  const email = cleanEmail(form.get("email"));
  const name = String(form.get("name") ?? "").trim();

  if (!name || !email || !email.includes("@")) {
    return redirectToMinisterio(request, "Informe nome e e-mail válidos para o convite.");
  }

  const { data: ministry } = await admin
    .from("ministries")
    .select("id,seat_limit,status")
    .eq("id", context.ministry.ministryId)
    .single();

  if (!ministry?.id) return redirectToMinisterio(request, "Central ministerial não encontrada.");
  if (!["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) return redirectToMinisterio(request, "Seu plano ministerial não está ativo.");

  const { count } = await admin
    .from("ministry_members")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministry.id)
    .in("status", ["active", "pending", "invited"]);

  if ((count ?? 0) >= Number(ministry.seat_limit ?? 0)) {
    return redirectToMinisterio(request, "Você atingiu o limite de vagas do seu plano.");
  }

  const { data: existingMember } = await admin
    .from("ministry_members")
    .select("id")
    .eq("ministry_id", ministry.id)
    .ilike("invited_email", email)
    .in("status", ["active", "pending", "invited"])
    .maybeSingle();

  if (existingMember?.id) return redirectToMinisterio(request, "Esse integrante já possui acesso ou convite pendente.");

  const { data: profile } = await admin.from("profiles").select("id,email").ilike("email", email).maybeSingle();
  const now = new Date().toISOString();
  const token = randomBytes(24).toString("hex");

  const { error } = await admin.from("ministry_members").insert({
    ministry_id: context.ministry.ministryId,
    user_id: null,
    invited_email: email,
    invited_name: name,
    role: "member",
    status: profile?.id ? "pending" : "invited",
    invite_token: token,
    invited_by: context.profile.id,
    invited_at: now,
    created_at: now,
    updated_at: now,
  });

  if (error) return redirectToMinisterio(request, error.message || "Falha ao preparar convite.");

  await admin.from("ministry_activity_logs").insert({
    ministry_id: context.ministry.ministryId,
    actor_id: context.profile.id,
    action: "member.invited",
    metadata: { email, name, status: profile?.id ? "pending" : "invited" },
  });

  return redirectToMinisterio(request, "Convite Premium enviado com sucesso.");
}
