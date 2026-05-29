import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { buildAbsoluteUrl, sendMinistryInviteEmail } from "@/lib/email/ministry-invite-email";
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

function emailStatusMessage(action: "created" | "resent", result: Awaited<ReturnType<typeof sendMinistryInviteEmail>>, email?: string | null) {
  const target = email ? ` para ${email}` : "";

  if (result.sent) {
    return action === "created"
      ? `Convite enviado com sucesso${target}. O integrante receberá um link para criar a conta e liberar o acesso Premium Ministerial.`
      : `Convite reenviado com sucesso${target}. O novo link já foi enviado para o integrante.`;
  }

  if (result.skipped) {
    return `Convite gerado, mas o e-mail ainda não foi enviado automaticamente. Use os botões Copiar link ou WhatsApp para compartilhar o acesso.`;
  }

  return `Convite gerado, mas não conseguimos enviar o e-mail agora. Use os botões Copiar link ou WhatsApp e tente reenviar mais tarde.`;
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

  const { data: ministry } = await admin
    .from("ministries")
    .select("id,name,seat_limit,status")
    .eq("id", context.ministry.ministryId)
    .maybeSingle();

  if (!ministry?.id) {
    return redirectToMinisterio(request, "Central ministerial não encontrada.");
  }

  if (!["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) {
    return redirectToMinisterio(request, "Seu plano ministerial não está ativo.");
  }

  if (resendMemberId) {
    const newToken = crypto.randomUUID();
    const { data: member, error } = await admin
      .from("ministry_members")
      .update({ invite_token: newToken, invited_at: now, updated_at: now })
      .eq("id", resendMemberId)
      .eq("ministry_id", context.ministry.ministryId)
      .in("status", ["pending", "invited"])
      .select("id,invited_email,invited_name,invite_token")
      .single();

    if (error || !member?.id) return redirectToMinisterio(request, "Não foi possível reenviar o convite.");

    const inviteUrl = buildAbsoluteUrl(`/convite-ministerio/${member.invite_token}`, request.url);
    console.log("[MINISTRY INVITE] resend preparing email", {
      to: member.invited_email,
      from: process.env.RESEND_FROM_EMAIL,
      ministry: ministry.name,
      memberId: member.id,
    });

    const emailResult = await sendMinistryInviteEmail({
      to: member.invited_email,
      invitedName: member.invited_name,
      ministryName: ministry.name,
      inviteUrl,
    });

    console.log("[MINISTRY INVITE] resend result", emailResult);
    return redirectToMinisterio(request, emailStatusMessage("resent", emailResult, member.invited_email));
  }

  const email = normalizeEmail(form.get("email"));
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "member").trim().toLowerCase();

  if (!email || !email.includes("@") || !["member", "manager"].includes(role)) {
    return redirectToMinisterio(request, "Informe dados válidos para o convite.");
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

  const inviteToken = crypto.randomUUID();
  const { data: insertedMember, error } = await admin
    .from("ministry_members")
    .insert({
      ministry_id: context.ministry.ministryId,
      user_id: profile?.id ?? null,
      invited_email: email,
      invited_name: name || profile?.full_name || "Integrante",
      role,
      status: profile?.id ? "pending" : "invited",
      invite_token: inviteToken,
      invited_by: context.profile.id,
      invited_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id,invited_email,invited_name,invite_token")
    .single();

  if (error || !insertedMember?.id) {
    return redirectToMinisterio(request, "Não foi possível preparar o convite. Tente novamente em instantes.");
  }

  const inviteUrl = buildAbsoluteUrl(`/convite-ministerio/${insertedMember.invite_token}`, request.url);
  console.log("[MINISTRY INVITE] preparing email", {
    to: insertedMember.invited_email,
    from: process.env.RESEND_FROM_EMAIL,
    ministry: ministry.name,
    inviteToken,
  });

  const emailResult = await sendMinistryInviteEmail({
    to: insertedMember.invited_email,
    invitedName: insertedMember.invited_name,
    ministryName: ministry.name,
    inviteUrl,
  });

  console.log("[MINISTRY INVITE] resend response", emailResult);
  return redirectToMinisterio(request, emailStatusMessage("created", emailResult, insertedMember.invited_email));
}
