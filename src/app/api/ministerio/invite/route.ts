import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { getMinistrySeatLimit } from "@/lib/data/ministry";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { buildAbsoluteUrl, sendMinistryInviteEmail } from "@/lib/email/ministry-invite-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function wantsJson(request: Request) {
  return request.headers.get("x-harmomus-action") === "fetch" || request.headers.get("accept")?.includes("application/json");
}

function ministryResponse(request: Request, message: string, hash = "convites", status = 200) {
  if (wantsJson(request)) {
    return NextResponse.json({ ok: status < 400, message, hash }, { status });
  }

  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  url.hash = hash;
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

function resolveSeatLimit(ministry: any, context: Awaited<ReturnType<typeof getCurrentUserAccessContext>>) {
  const directLimit = Number(ministry?.seat_limit ?? 0);
  if (directLimit > 0) return directLimit;
  const planType = String(ministry?.plan_type ?? context.ministry?.planType ?? "").trim().toLowerCase();
  const planLimit = getMinistrySeatLimit(planType);
  if (planLimit > 0) return planLimit;
  return Number(context.ministry?.seatLimit ?? 0);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryManager(context)) {
    return ministryResponse(request, "Você não possui permissão para convidar integrantes.", "convites", 403);
  }

  const form = await request.formData();
  const resendMemberId = String(form.get("resend_member_id") ?? "").trim();
  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { data: ministry } = await admin
    .from("ministries")
    .select("id,name,seat_limit,plan_type,status")
    .eq("id", context.ministry.ministryId)
    .maybeSingle();

  if (!ministry?.id) {
    return ministryResponse(request, "Central ministerial não encontrada.", "convites", 404);
  }

  if (!["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) {
    return ministryResponse(request, "Seu plano ministerial não está ativo.", "convites", 409);
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

    if (error || !member?.id) return ministryResponse(request, "Não foi possível reenviar o convite.", "convites", 400);

    const inviteUrl = buildAbsoluteUrl(`/convite-ministerio/${member.invite_token}`, request.url);
    const emailResult = await sendMinistryInviteEmail({
      to: member.invited_email,
      invitedName: member.invited_name,
      ministryName: ministry.name,
      inviteUrl,
    });

    const actorName = getActivityActorName(context.profile);
    await logMinistryActivity({
      ministryId: context.ministry.ministryId,
      actorUserId: context.profile.id,
      actorName,
      action: "invite.resent",
      entityType: "ministry_member",
      entityId: member.id,
      description: `${actorName} reenviou o convite para ${member.invited_name || member.invited_email || "integrante"}`,
      metadata: { member_id: member.id, member_email: member.invited_email, member_name: member.invited_name, invite_token: member.invite_token },
    });

    return ministryResponse(request, emailStatusMessage("resent", emailResult, member.invited_email));
  }

  const email = normalizeEmail(form.get("email"));
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "member").trim().toLowerCase();
  const normalizedRole = role === "manager" ? "admin" : role;

  if (!email || !email.includes("@") || !["member", "admin"].includes(normalizedRole)) {
    return ministryResponse(request, "Informe dados válidos para o convite.", "convites", 400);
  }

  const { data: allMembers } = await admin
    .from("ministry_members")
    .select("id,status,invited_email,user_id")
    .eq("ministry_id", ministry.id);

  const duplicate = (allMembers ?? []).find((member: any) => String(member.invited_email ?? "").trim().toLowerCase() === email);
  if (duplicate) {
    if (String(duplicate.status) === "removed") {
      return ministryResponse(request, "Este integrante está arquivado. Use o botão Restaurar para devolver o acesso sem criar novo convite.", "arquivados", 409);
    }
    return ministryResponse(request, "Esse integrante já possui acesso ou convite pendente.", "convites", 409);
  }

  const seatLimit = resolveSeatLimit(ministry, context);
  if (seatLimit <= 0) {
    return ministryResponse(request, "Não foi possível identificar o limite de vagas deste plano.", "convites", 409);
  }

  const usedSeats = (allMembers ?? []).filter((member: any) => ["active", "pending", "invited"].includes(String(member.status))).length;
  if (usedSeats >= seatLimit) {
    return ministryResponse(request, "Você atingiu o limite de vagas do seu plano.", "convites", 409);
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
      role: normalizedRole,
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
    return ministryResponse(request, "Não foi possível preparar o convite. Tente novamente em instantes.", "convites", 500);
  }

  const inviteUrl = buildAbsoluteUrl(`/convite-ministerio/${insertedMember.invite_token}`, request.url);
  const emailResult = await sendMinistryInviteEmail({
    to: insertedMember.invited_email,
    invitedName: insertedMember.invited_name,
    ministryName: ministry.name,
    inviteUrl,
  });

  const actorName = getActivityActorName(context.profile);
  await logMinistryActivity({
    ministryId: context.ministry.ministryId,
    actorUserId: context.profile.id,
    actorName,
    action: "invite.created",
    entityType: "ministry_member",
    entityId: insertedMember.id,
    description: `${actorName} convidou ${insertedMember.invited_name || insertedMember.invited_email || "integrante"} para o ministério`,
    metadata: {
      member_id: insertedMember.id,
      member_email: insertedMember.invited_email,
      member_name: insertedMember.invited_name,
      role: normalizedRole,
      invite_token: insertedMember.invite_token,
    },
  });

  return ministryResponse(request, emailStatusMessage("created", emailResult, insertedMember.invited_email));
}
