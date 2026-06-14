import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryOwner } from "@/lib/auth/current-user";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function wantsJson(request: Request) {
  return request.headers.get("x-harmomus-action") === "fetch" || request.headers.get("accept")?.includes("application/json");
}

function ministryResponse(request: Request, message: string, status = 200) {
  if (wantsJson(request)) return NextResponse.json({ ok: status < 400, message }, { status });
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
    return ministryResponse(request, "Faça login para alterar permissões.", 401);
  }

  if (!isMinistryOwner(context)) {
    return ministryResponse(request, "Apenas o responsável do ministério pode alterar permissões.", 403);
  }

  const form = await request.formData();
  const memberId = String(form.get("member_id") ?? "").trim();
  const role = String(form.get("role") ?? "").trim().toLowerCase();

  if (!memberId || !["admin", "member"].includes(role)) {
    return ministryResponse(request, "Permissão inválida.", 400);
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: member, error: memberError } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,status,invited_email,invited_name")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (memberError) {
    return ministryResponse(request, memberError.message || "Não foi possível localizar o integrante.", 500);
  }

  if (!member?.id) {
    return ministryResponse(request, "Integrante não encontrado neste ministério.", 404);
  }

  if (String(member.role) === "owner") {
    return ministryResponse(request, "Não é permitido alterar o responsável do ministério.", 409);
  }

  if (String(member.status) === "removed") {
    return ministryResponse(request, "Não é permitido alterar integrante arquivado.", 409);
  }

  const { data: memberProfile } = member.user_id
    ? await admin.from("profiles").select("full_name,email").eq("id", member.user_id).maybeSingle()
    : { data: null };

  const previousRole = String(member.role ?? "member").toLowerCase();
  if (previousRole === role || (previousRole === "manager" && role === "admin")) {
    return ministryResponse(request, "Permissão atualizada com sucesso");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("ministry_members")
    .update({ role, updated_at: now })
    .eq("id", member.id)
    .eq("ministry_id", context.ministry.ministryId);

  if (updateError) {
    return ministryResponse(request, updateError.message || "Não foi possível atualizar a permissão.", 500);
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

  return ministryResponse(request, "Permissão atualizada com sucesso");
}
