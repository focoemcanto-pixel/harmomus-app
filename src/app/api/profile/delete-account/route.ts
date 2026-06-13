import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CONFIRMATION_PHRASE = "EXCLUIR MINHA CONTA";
const BLOCKING_STATUSES = new Set(["active", "trialing", "past_due", "overdue", "incomplete", "pending"]);

function isBlockingSubscription(status?: string | null) {
  return BLOCKING_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }

    if (isBlockingSubscription(context.subscription?.status)) {
      return NextResponse.json(
        { error: "Você possui uma assinatura ativa ou pendente. Cancele/regularize a assinatura antes de excluir sua conta.", redirectTo: "/assinatura" },
        { status: 409 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const confirmation = String(body?.confirmation ?? "").trim();
    if (confirmation !== CONFIRMATION_PHRASE) {
      return NextResponse.json({ error: `Digite exatamente: ${CONFIRMATION_PHRASE}` }, { status: 400 });
    }

    const admin = createSupabaseAdminClient() as any;
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await admin
      .from("profiles")
      .update({
        deletion_requested_at: now.toISOString(),
        deletion_scheduled_for: scheduledFor,
        deletion_cancelled_at: null,
        onboarding_step: "account_deletion_scheduled",
        updated_at: now.toISOString(),
      })
      .eq("id", context.profile.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, scheduledFor });
  } catch (error) {
    console.error("[profile.delete-account] schedule failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao solicitar exclusão da conta." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) {
      return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
    }

    const admin = createSupabaseAdminClient() as any;
    const now = new Date().toISOString();
    const { error } = await admin
      .from("profiles")
      .update({
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        deletion_cancelled_at: now,
        onboarding_step: "account_deletion_cancelled",
        updated_at: now,
      })
      .eq("id", context.profile.id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[profile.delete-account] cancel failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cancelar exclusão da conta." }, { status: 500 });
  }
}
