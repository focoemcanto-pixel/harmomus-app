import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { getCurrentUserAccessContext, isMinistryManager } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

function redirectToMinisterio(request: Request, message?: string) {
  const url = new URL("/ministerio", request.url);
  if (message) {
    url.searchParams.set("message", message);
  }

  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile || !context.ministry || !isMinistryManager(context)) {
    return redirectToMinisterio(request, "Você não possui permissão para convidar integrantes.");
  }

  const form = await request.formData();

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();

  const name = String(form.get("name") ?? "").trim();

  const role = String(form.get("role") ?? "member");

  if (!email || !email.includes("@") || !["member", "manager"].includes(role)) {
    return redirectToMinisterio(request, "Informe dados válidos para o convite.");
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const supabase = (await createClient()) as any;

  const { data: ministry } = await supabase
    .from("ministries")
    .select("id,seat_limit,status")
    .eq("id", context.ministry.ministryId)
    .single();

  if (!ministry?.id) {
    return redirectToMinisterio(request, "Central ministerial não encontrada.");
  }

  if (!["active", "trialing"].includes(String(ministry.status ?? "").toLowerCase())) {
    return redirectToMinisterio(request, "Seu plano ministerial não está ativo.");
  }

  const { count } = await supabase
    .from("ministry_members")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministry.id)
    .in("status", ["pending", "active"]);

  if ((count ?? 0) >= Number(ministry.seat_limit ?? 0)) {
    return redirectToMinisterio(request, "Você atingiu o limite de vagas do seu plano.");
  }

  const { data: existingMember } = await supabase
    .from("ministry_members")
    .select("id")
    .eq("ministry_id", ministry.id)
    .ilike("invited_email", email)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (existingMember?.id) {
    return redirectToMinisterio(request, "Esse integrante já possui acesso ou convite pendente.");
  }

  const { error: inviteError } = await supabase.from("ministry_invites").insert({
    ministry_id: context.ministry.ministryId,
    email,
    role,
    token,
    invited_name: name || null,
    invited_by: context.profile.id,
    expires_at: expiresAt,
  });

  if (inviteError) {
    return redirectToMinisterio(request, inviteError.message || "Não foi possível criar o convite.");
  }

  const { error: memberError } = await supabase.from("ministry_members").insert({
    ministry_id: context.ministry.ministryId,
    invited_email: email,
    invited_name: name || null,
    role,
    status: "pending",
    invite_token: token,
    invited_by: context.profile.id,
    invited_at: new Date().toISOString(),
  });

  if (memberError) {
    return redirectToMinisterio(request, memberError.message || "Falha ao preparar membro pendente.");
  }

  return redirectToMinisterio(request, "Convite enviado com sucesso.");
}
