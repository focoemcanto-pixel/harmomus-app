import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) {
    url.searchParams.set("message", message);
  }

  return NextResponse.redirect(url, 303);
}

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile || !context.ministry || !isMinistryManager(context)) {
    return redirectToMinisterio(request, "Você não possui permissão para convidar integrantes.");
  }

  const form = await request.formData();
  const email = normalizeEmail(form.get("email"));
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "member").trim().toLowerCase();

  if (!email || !email.includes("@") || !["member", "manager"].includes(role)) {
    return redirectToMinisterio(request, "Informe dados válidos para o convite.");
  }

  const token = randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const admin = createSupabaseAdminClient() as any;

  const { data: ministry, error: ministryError } = await admin
    .from("ministries")
    .select("id,seat_limit,status")
    .eq("id", context.ministry.ministryId)
    .maybeSingle();

  if (ministryError || !ministry?.id) {
    return redirectToMinisterio(request, "Central ministerial não encontrada.");
  }

  if (!["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) {
    return redirectToMinisterio(request, "Seu plano ministerial não está ativo.");
  }

  const { count: usedSeats } = await admin
    .from("ministry_members")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministry.id)
    .in("status", ["pending", "active"]);

  if ((usedSeats ?? 0) >= Number(ministry.seat_limit ?? 0)) {
    return redirectToMinisterio(request, "Você atingiu o limite de vagas do seu plano.");
  }

  const { data: existingMember } = await admin
    .from("ministry_members")
    .select("id,status")
    .eq("ministry_id", ministry.id)
    .ilike("invited_email", email)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (existingMember?.id) {
    return redirectToMinisterio(request, "Esse integrante já possui acesso ou convite pendente.");
  }

  const { data: existingInvite } = await admin
    .from("ministry_invites")
    .select("id,status,expires_at")
    .eq("ministry_id", ministry.id)
    .ilike("email", email)
    .eq("status", "pending")
    .maybeSingle();

  if (existingInvite?.id && new Date(existingInvite.expires_at).getTime() > Date.now()) {
    return redirectToMinisterio(request, "Esse e-mail já possui um convite pendente.");
  }

  if (existingInvite?.id) {
    await admin.from("ministry_invites").update({ status: "expired" }).eq("id", existingInvite.id);
  }

  const { data: invite, error: inviteError } = await admin
    .from("ministry_invites")
    .insert({
      ministry_id: context.ministry.ministryId,
      email,
      role,
      token,
      invited_by: context.profile.id,
      expires_at: expiresAt,
      status: "pending",
    })
    .select("id")
    .single();

  if (inviteError || !invite?.id) {
    return redirectToMinisterio(request, inviteError?.message || "Não foi possível criar o convite.");
  }

  const { error: memberError } = await admin.from("ministry_members").insert({
    ministry_id: context.ministry.ministryId,
    invited_email: email,
    invited_name: name || null,
    role,
    status: "pending",
    invite_token: token,
    invited_by: context.profile.id,
    invited_at: now,
    created_at: now,
    updated_at: now,
  });

  if (memberError) {
    await admin.from("ministry_invites").update({ status: "canceled" }).eq("id", invite.id);
    return redirectToMinisterio(request, memberError.message || "Falha ao preparar membro pendente.");
  }

  return redirectToMinisterio(request, "Convite enviado com sucesso.");
}
