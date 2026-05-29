import { NextResponse } from "next/server";

import { getCurrentUserAccessContext, isMinistryOwner } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) url.searchParams.set("message", message);
  url.hash = "arquivados";
  return NextResponse.redirect(url, 303);
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
    .select("id,ministry_id,user_id,role,status,invited_email")
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

  const { count: usedSeats } = await admin
    .from("ministry_members")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", context.ministry.ministryId)
    .in("status", ["active", "pending", "invited"]);

  if ((usedSeats ?? 0) >= Number(ministry.seat_limit ?? 0)) {
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

  try {
    const { error: logError } = await admin.from("ministry_activity_logs").insert({
      ministry_id: member.ministry_id,
      actor_id: context.profile.id,
      action: "member.restored",
      metadata: {
        member_id: member.id,
        user_id: member.user_id,
        email: member.invited_email,
        restored_at: now,
      },
    });

    if (logError && logError.code !== "42P01") {
      console.error("[ministerio.restore] Falha ao registrar log de restauração", logError);
    }
  } catch (logError) {
    console.error("[ministerio.restore] Log de restauração ignorado", logError);
  }

  return redirectToMinisterio(request, "Integrante restaurado com sucesso.");
}
