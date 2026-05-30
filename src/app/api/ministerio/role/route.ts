import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryOwner } from "@/lib/auth/current-user";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  url.hash = "integrantes";
  return NextResponse.redirect(url, 303);
}

function roleLabel(role: string) {
  if (role === "admin" || role === "manager") return "Admin";
  return "Integrante";
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry) {
    return redirectToMinisterio(request, "Faça login para alterar permissões.");
  }

  if (!isMinistryOwner(context)) {
    return redirectToMinisterio(request, "Apenas o responsável do ministério pode alterar permissões.");
  }

  const form = await request.formData();
  const memberId = String(form.get("member_id") ?? "").trim();
  const role = String(form.get("role") ?? "").trim().toLowerCase();

  if (!memberId || !["admin", "member"].includes(role)) {
    return redirectToMinisterio(request, "Permissão inválida.");
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: member, error: memberError } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,status,invited_email,invited_name")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (memberError) {
    return redirectToMinisterio(request, memberError.message || "Não foi possível localizar o integrante.");
  }

  if (!member?.id) {
    return redirectToMinisterio(request, "Integrante não encontrado neste ministério.");
  }

  if (String(member.role) === "owner") {
    return redirectToMinisterio(request, "Não é permitido alterar o responsável do ministério.");
  }

  if (String(member.status) === "removed") {
    return redirectToMinisterio(request, "Não é permitido alterar integrante arquivado.");
  }

  const { data: memberProfile } = member.user_id
    ? await admin.from("profiles").select("full_name,email").eq("id", member.user_id).maybeSingle()
    : { data: null };

  const previousRole = String(member.role ?? "member").toLowerCase();
  if (previousRole === role || (previousRole === "manager" && role === "admin")) {
    return redirectToMinisterio(request, "Permissão atualizada com sucesso");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("ministry_members")
    .update({ role, updated_at: now })
    .eq("id", member.id)
    .eq("ministry_id", context.ministry.ministryId);

  if (updateError) {
    return redirectToMinisterio(request, updateError.message || "Não foi possível atualizar a permissão.");
  }

  const actorName = getActivityActorName(context.profile);
  const memberName = memberProfile?.full_name || member.invited_name || memberProfile?.email || member.invited_email || "integrante";
  const verb = role === "admin" ? "promoveu" : "rebaixou";
  const description = `${actorName} ${verb} ${memberName} para ${roleLabel(role)}`;

  await logMinistryActivity({
    ministryId: context.ministry.ministryId,
    actorUserId: context.profile.id,
    actorName,
    action: role === "admin" ? "member.promoted" : "member.demoted",
    entityType: "ministry_member",
    entityId: member.id,
    description,
    metadata: {
      member_id: member.id,
      previous_role: previousRole,
      new_role: role,
      member_email: memberProfile?.email || member.invited_email || null,
      member_name: memberName,
    },
  });

  return redirectToMinisterio(request, "Permissão atualizada com sucesso");
}
