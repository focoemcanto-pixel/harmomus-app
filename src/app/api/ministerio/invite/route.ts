import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  url.hash = "convites";
  return NextResponse.redirect(url, 303);
}

function normalizeEmail(value: FormDataEntryValue | null) {
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
  const now = new Date().toISOString();

  if (resendMemberId) {
    const { error } = await admin
      .from("ministry_members")
      .update({
        invite_token: crypto.randomUUID(),
        invited_at: now,
        updated_at: now,
      })
      .eq("id", resendMemberId)
      .eq("ministry_id", context.ministry.ministryId)
      .in("status", ["pending", "invited"]);

    return redirectToMinisterio(request, error ? "Não foi possível reenviar o convite." : "Convite reenviado com sucesso.");
  }

  const email = normalizeEmail(form.get("email"));
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "member").trim().toLowerCase();

  if (!email || !email.includes("@") || !["member", "manager"].includes(role)) {
    return redirectToMinisterio(request, "Informe dados válidos para o convite.");
  }

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

  const { data: members } = await admin
    .from("ministry_members")
    .select("id,status,invited_email,user_id")
    .eq("ministry_id", ministry.id)
    .neq("status", "removed");

  const usedSeats = (members ?? []).filter((member: any) => ["active", "pending", "invited"].includes(String(member.status))).length;
  if (usedSeats >= Number(ministry.seat_limit ?? 0)) {
    return redirectToMinisterio(request, "Você atingiu o limite de vagas do seu plano.");
  }

  const duplicate = (members ?? []).find((member: any) => String(member.invited_email ?? "").trim().toLowerCase() === email);
  if (duplicate) {
    return redirectToMinisterio(request, "Esse integrante já possui acesso ou convite pendente.");
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id,email,full_name")
    .ilike("email", email)
    .maybeSingle();

  const { error } = await admin.from("ministry_members").insert({
    ministry_id: context.ministry.ministryId,
    user_id: profile?.id ?? null,
    invited_email: email,
    invited_name: name || profile?.full_name || "Integrante",
    role,
    status: profile?.id ? "pending" : "invited",
    invite_token: crypto.randomUUID(),
    invited_by: context.profile.id,
    invited_at: now,
    created_at: now,
    updated_at: now,
  });

  return redirectToMinisterio(request, error ? error.message || "Falha ao preparar convite." : "Convite Premium criado com sucesso.");
}
