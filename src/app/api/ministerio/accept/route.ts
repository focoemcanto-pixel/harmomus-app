import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectTo(url: string, request: Request, message?: string) {
  const target = new URL(url, request.url);
  if (message) target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id) {
    return redirectTo("/login", request);
  }

  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();

  if (!token) {
    return redirectTo("/", request, "Convite inválido.");
  }

  const admin = createSupabaseAdminClient() as any;

  const { data: member } = await admin
    .from("ministry_members")
    .select("id,ministry_id,user_id,role,status,invited_email,invite_token")
    .eq("invite_token", token)
    .maybeSingle();

  if (!member?.id) {
    return redirectTo("/", request, "Convite não encontrado.");
  }

  if (member.status === "active") {
    return redirectTo("/", request, "Este convite já foi utilizado.");
  }

  if (member.status === "removed") {
    return redirectTo("/", request, "Este convite foi removido.");
  }

  const { data: ministry } = await admin
    .from("ministries")
    .select("id,name,status,seat_limit")
    .eq("id", member.ministry_id)
    .maybeSingle();

  if (!ministry?.id || !["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) {
    return redirectTo(`/convite-ministerio/${token}`, request, "O plano ministerial não está ativo.");
  }

  const currentEmail = String(context.profile.email ?? "").trim().toLowerCase();
  const inviteEmail = String(member.invited_email ?? "").trim().toLowerCase();

  if (currentEmail !== inviteEmail) {
    return redirectTo(`/convite-ministerio/${token}`, request, "Entre com o e-mail correto para aceitar o convite.");
  }

  const { count: usedSeats } = await admin
    .from("ministry_members")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", member.ministry_id)
    .in("status", ["active", "pending", "invited"]);

  if ((usedSeats ?? 0) > Number(ministry.seat_limit ?? 0)) {
    return redirectTo(`/convite-ministerio/${token}`, request, "O limite de vagas deste ministério foi atingido.");
  }

  const now = new Date().toISOString();

  const { error } = await admin
    .from("ministry_members")
    .update({
      user_id: context.profile.id,
      status: "active",
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", member.id);

  if (error) {
    return redirectTo(`/convite-ministerio/${token}`, request, error.message || "Não foi possível aceitar o convite.");
  }

  return redirectTo("/", request, "Acesso Premium liberado com sucesso.");
}
