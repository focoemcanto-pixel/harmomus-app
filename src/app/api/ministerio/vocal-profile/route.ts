import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_VOCAL_PROFILES = new Set([
  "lead",
  "tenor",
  "contralto",
  "soprano",
  "baritono",
  "baixo",
  "instrumento",
  "outro",
]);

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

function normalizeVocalValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

function isValidVocalValue(value: string | null) {
  return value === null || ALLOWED_VOCAL_PROFILES.has(value);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry) {
    return ministryResponse(request, "Faça login para editar o perfil vocal.", 401);
  }

  if (!isMinistryManager(context)) {
    return ministryResponse(request, "Você não possui permissão para editar perfil vocal.", 403);
  }

  const form = await request.formData();
  const memberId = String(form.get("member_id") ?? "").trim();
  const vocalPrimary = normalizeVocalValue(form.get("vocal_primary"));
  const vocalSecondary = normalizeVocalValue(form.get("vocal_secondary"));

  if (!memberId) {
    return ministryResponse(request, "Integrante inválido.", 400);
  }

  if (!isValidVocalValue(vocalPrimary) || !isValidVocalValue(vocalSecondary)) {
    return ministryResponse(request, "Perfil vocal inválido.", 400);
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: actorMembership } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,status")
    .eq("ministry_id", context.ministry.ministryId)
    .eq("user_id", context.profile.id)
    .eq("status", "active")
    .maybeSingle();

  if (!actorMembership?.id || !["owner", "admin", "manager"].includes(String(actorMembership.role))) {
    return ministryResponse(request, "Você não possui permissão para editar perfil vocal.", 403);
  }

  const { data: member, error: memberError } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,status,invited_email,invited_name,vocal_primary,vocal_secondary")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (memberError) {
    return ministryResponse(request, memberError.message || "Não foi possível localizar o integrante.", 500);
  }

  if (!member?.id) {
    return ministryResponse(request, "Integrante não encontrado neste ministério.", 404);
  }

  if (String(member.status) === "removed") {
    return ministryResponse(request, "Não é permitido editar integrante arquivado.", 409);
  }

  const previousVocalPrimary = member.vocal_primary ?? null;
  const previousVocalSecondary = member.vocal_secondary ?? null;

  if (previousVocalPrimary === vocalPrimary && previousVocalSecondary === vocalSecondary) {
    return ministryResponse(request, "Perfil vocal atualizado com sucesso");
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("ministry_members")
    .update({
      vocal_primary: vocalPrimary,
      vocal_secondary: vocalSecondary,
      updated_at: now,
    })
    .eq("id", member.id)
    .eq("ministry_id", context.ministry.ministryId)
    .neq("status", "removed");

  if (updateError) {
    return ministryResponse(request, updateError.message || "Não foi possível atualizar o perfil vocal.", 500);
  }

  const { data: memberProfile } = member.user_id
    ? await admin.from("profiles").select("full_name,email").eq("id", member.user_id).maybeSingle()
    : { data: null };

  const actorName = getActivityActorName(context.profile);
  const memberName = memberProfile?.full_name || member.invited_name || memberProfile?.email || member.invited_email || "integrante";
  const memberEmail = memberProfile?.email || member.invited_email || null;

  await logMinistryActivity({
    ministryId: context.ministry.ministryId,
    actorUserId: context.profile.id,
    actorName,
    action: "member.vocal_profile_updated",
    entityType: "ministry_member",
    entityId: member.id,
    description: `${actorName} atualizou o perfil vocal de ${memberName}`,
    metadata: {
      member_id: member.id,
      member_name: memberName,
      member_email: memberEmail,
      previous_vocal_primary: previousVocalPrimary,
      previous_vocal_secondary: previousVocalSecondary,
      new_vocal_primary: vocalPrimary,
      new_vocal_secondary: vocalSecondary,
    },
  });

  return ministryResponse(request, "Perfil vocal atualizado com sucesso");
}
