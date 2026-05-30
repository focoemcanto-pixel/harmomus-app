import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryOwner } from "@/lib/auth/current-user";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  url.hash = "arquivados";
  return NextResponse.redirect(url, 303);
}

function normalizeEmail(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryOwner(context)) {
    return redirectToMinisterio(request, "Você não possui permissão para restaurar integrantes.");
  }

  const form = await request.formData();
  const memberId = String(form.get("member_id") ?? "").trim();

  if (!memberId) {
    return redirectToMinisterio(request, "Integrante inválido.");
  }

  const admin = createSupabaseAdminClient() as any;

  const { data: member } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,status,invited_email,invited_name")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (!member?.id) {
    return redirectToMinisterio(request, "Integrante arquivado não encontrado.");
  }

  if (member.role === "owner") {
    return redirectToMinisterio(request, "O responsável principal não precisa ser restaurado.");
  }

  if (String(member.status) !== "removed") {
    return redirectToMinisterio(request, "Este integrante não está arquivado.");
  }

  const { data: ministry } = await admin
    .from("ministries")
    .select("id,seat_limit,status")
    .eq("id", context.ministry.ministryId)
    .maybeSingle();

  if (!ministry?.id || !["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) {
    return redirectToMinisterio(request, "O plano ministerial não está ativo.");
  }

  const seatLimit = Number(ministry.seat_limit ?? 0) || Number(context.ministry.seatLimit ?? 0);

  if (seatLimit <= 0) {
    return redirectToMinisterio(request, "Não foi possível identificar o limite de vagas deste plano.");
  }

  const { data: activeDuplicates } = await admin
    .from("ministry_members")
    .select("id,user_id,invited_email,status")
    .eq("ministry_id", context.ministry.ministryId)
    .in("status", ["active", "pending", "invited"]);

  const memberEmail = normalizeEmail(member.invited_email);
  const duplicate = (activeDuplicates ?? []).find((existing: any) => {
    if (existing.id === member.id) return false;
    const sameUser = member.user_id && existing.user_id === member.user_id;
    const sameEmail = memberEmail && normalizeEmail(existing.invited_email) === memberEmail;
    return sameUser || sameEmail;
  });

  if (duplicate) {
    return redirectToMinisterio(request, "Este integrante já possui outro acesso ou convite ativo neste ministério.");
  }

  const usedSeats = (activeDuplicates ?? []).length;

  if (usedSeats >= seatLimit) {
    return redirectToMinisterio(request, "Não há vagas livres para restaurar este integrante.");
  }

  const now = new Date().toISOString();

  const { error } = await admin
    .from("ministry_members")
    .update({
      status: member.user_id ? "active" : "pending",
      removed_at: null,
      updated_at: now,
    })
    .eq("id", member.id);

  if (error) {
    return redirectToMinisterio(request, error.message || "Não foi possível restaurar o integrante.");
  }

  const actorName = getActivityActorName(context.profile);
  const memberName = member.invited_name || member.invited_email || "integrante";
  await logMinistryActivity({
    ministryId: member.ministry_id,
    actorUserId: context.profile.id,
    actorName,
    action: "member.restored",
    entityType: "ministry_member",
    entityId: member.id,
    description: `${actorName} restaurou ${memberName} no ministério`,
    metadata: {
      member_id: member.id,
      user_id: member.user_id,
      member_email: member.invited_email,
      member_name: member.invited_name,
      restored_at: now,
    },
  });

  return redirectToMinisterio(request, "Integrante restaurado com sucesso.");
}
