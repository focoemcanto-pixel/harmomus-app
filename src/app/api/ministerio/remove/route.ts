import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id || !context.ministry || !isMinistryManager(context)) {
    return redirectToMinisterio(request, "Você não possui permissão para remover integrantes.");
  }

  const form = await request.formData();
  const memberId = String(form.get("member_id") ?? "").trim();

  if (!memberId) {
    return redirectToMinisterio(request, "Integrante inválido.");
  }

  const admin = createSupabaseAdminClient() as any;

  const { data: member } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,invited_email,status")
    .eq("id", memberId)
    .eq("ministry_id", context.ministry.ministryId)
    .maybeSingle();

  if (!member?.id) {
    return redirectToMinisterio(request, "Integrante não encontrado.");
  }

  if (member.role === "owner") {
    return redirectToMinisterio(request, "O responsável principal não pode ser removido.");
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
    return redirectToMinisterio(request, error.message || "Não foi possível remover o integrante.");
  }

  await admin.from("ministry_activity_logs").insert({
    ministry_id: member.ministry_id,
    actor_id: context.profile.id,
    action: "member.removed",
    metadata: {
      member_id: member.id,
      user_id: member.user_id,
      email: member.invited_email,
      removed_at: now,
    },
  });

  return redirectToMinisterio(request, "Integrante removido e vaga liberada.");
}
