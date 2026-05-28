import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectTo(url: string, request: Request, message?: string) {
  const target = new URL(url, request.url);
  if (message) {
    target.searchParams.set("message", message);
  }

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
    .select("*, ministry:ministries(id,name,status,seat_limit)")
    .eq("invite_token", token)
    .maybeSingle();

  if (!member?.id) {
    return redirectTo("/", request, "Convite não encontrado.");
  }

  if (member.status === "active") {
    return redirectTo("/ministerio", request, "Este convite já foi utilizado.");
  }

  const currentEmail = String(context.profile.email ?? "")
    .trim()
    .toLowerCase();

  const inviteEmail = String(member.invited_email ?? "")
    .trim()
    .toLowerCase();

  if (currentEmail !== inviteEmail) {
    return redirectTo(`/convite-ministerio/${token}`, request, "Entre com o e-mail correto para aceitar o convite.");
  }

  if (!["active", "trialing"].includes(String(member.ministry?.status ?? "").toLowerCase())) {
    return redirectTo(`/convite-ministerio/${token}`, request, "O plano ministerial não está ativo.");
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

  await admin.from("ministry_activity_logs").insert({
    ministry_id: member.ministry_id,
    actor_id: context.profile.id,
    action: "member.accepted",
    metadata: {
      email: inviteEmail,
      accepted_at: now,
    },
  });

  return redirectTo("/", request, "Acesso Premium liberado com sucesso.");
}
