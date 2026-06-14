import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryOwner } from "@/lib/auth/current-user";
import { getActivityActorName, logMinistryActivity } from "@/lib/data/ministry-activity";
import { buildAbsoluteUrl, sendMinistryAccessRemovedEmail } from "@/lib/email/ministry-invite-email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function wantsJson(request: Request) {
  return request.headers.get("x-harmomus-action") === "fetch" || request.headers.get("accept")?.includes("application/json");
}

function ministryResponse(request: Request, message: string, status = 200) {
  if (wantsJson(request)) return NextResponse.json({ ok: status < 400, message }, { status });
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryOwner(context)) {
    return ministryResponse(request, "Você não possui permissão para remover integrantes.", 403);
  }

  const form = await request.formData();
  const memberId = String(form.get("member_id") ?? "").trim();

  if (!memberId) {
    return ministryResponse(request, "Integrante inválido.", 400);
  }

  const admin = createSupabaseAdminClient() as any;

  const { data: member } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,invited_email,invited_name,status,ministry:ministries(name)")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (!member?.id) {
    return ministryResponse(request, "Integrante não encontrado.", 404);
  }

  if (member.role === "owner") {
    return ministryResponse(request, "O responsável principal não pode ser removido.", 409);
  }

  const now = new Date().toISOString();

  const { error } = await admin
    .from("ministry_members")
    .update({
      status: "removed",
      removed_at: now,
      updated_at: now,
    })
    .eq("id", member.id);

  if (error) {
    return ministryResponse(request, error.message || "Não foi possível remover o integrante.", 500);
  }

  const actorName = getActivityActorName(context.profile);
  const memberName = member.invited_name || member.invited_email || "integrante";
  await logMinistryActivity({
    ministryId: member.ministry_id,
    actorUserId: context.profile.id,
    actorName,
    action: "member.removed",
    entityType: "ministry_member",
    entityId: member.id,
    description: `${actorName} removeu ${memberName} do ministério`,
    metadata: {
      member_id: member.id,
      user_id: member.user_id,
      member_email: member.invited_email,
      member_name: member.invited_name,
      removed_at: now,
    },
  });

  if (member.invited_email) {
    try {
      await sendMinistryAccessRemovedEmail({
        to: member.invited_email,
        invitedName: member.invited_name,
        ministryName: member.ministry?.name,
        premiumUrl: buildAbsoluteUrl("/assinar?plano=premium", request.url),
      });
    } catch (emailError) {
      console.error("[ministerio.remove] Falha ao enviar e-mail de remoção", emailError);
    }
  }

  return ministryResponse(request, "Integrante removido, vaga liberada e acesso Premium Ministerial encerrado.");
}
