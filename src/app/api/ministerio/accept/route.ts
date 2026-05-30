import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function redirectTo(url: string, request: Request, message?: string) {
  const target = new URL(url, request.url);
  if (message) target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

function getLoginRedirect(request: Request, token: string) {
  const next = `/api/ministerio/accept?token=${encodeURIComponent(token)}`;
  return `/login?redirect=${encodeURIComponent(next)}`;
}

async function acceptInvite(request: Request, token: string) {
  const context = await getCurrentUserAccessContext();

  if (!context.profile?.id) {
    return redirectTo(getLoginRedirect(request, token), request);
  }

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
    if (member.user_id === context.profile.id) {
      return redirectTo("/", request, "Seu acesso ministerial já está ativo.");
    }
    return redirectTo("/", request, "Este convite já foi usado por outra conta.");
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

  const { data: occupiedSeats } = await admin
    .from("ministry_members")
    .select("id")
    .eq("ministry_id", member.ministry_id)
    .in("status", ["active", "pending", "invited"]);

  const usedSeatsExcludingCurrentInvite = (occupiedSeats ?? []).filter((seat: any) => seat.id !== member.id).length;
  const seatLimit = Number(ministry.seat_limit ?? 0);
  if (seatLimit > 0 && usedSeatsExcludingCurrentInvite >= seatLimit) {
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
    .eq("id", member.id)
    .in("status", ["pending", "invited"]);

  if (error) {
    return redirectTo(`/convite-ministerio/${token}`, request, error.message || "Não foi possível aceitar o convite.");
  }

  return redirectTo("/", request, "Acesso Premium Ministerial liberado com sucesso.");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get("token") ?? "").trim();
  return acceptInvite(request, token);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "").trim();
  return acceptInvite(request, token);
}
