import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PHRASE = "EXCLUIR MINHA CONTA";
const ACTIVE_STATUSES = ["active", "trialing"];

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function hasPaidAccess(admin: any, userId: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select("id,status,plans(slug)")
    .eq("user_id", userId)
    .in("status", ACTIVE_STATUSES)
    .limit(10);

  if (error) throw new Error(error.message);
  return (data ?? []).some((row: any) => {
    const status = String(row?.status ?? "").toLowerCase();
    const slug = String(row?.plans?.slug ?? "").toLowerCase();
    return slug !== "free" && ACTIVE_STATUSES.includes(status);
  });
}

export async function POST(request: Request) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (text(body?.confirmation) !== PHRASE) {
      return NextResponse.json({ error: `Digite exatamente: ${PHRASE}` }, { status: 400 });
    }

    const admin = createSupabaseAdminClient() as any;
    if (await hasPaidAccess(admin, userId)) {
      return NextResponse.json({ error: "Você possui uma assinatura ativa. Cancele a assinatura antes de solicitar o encerramento da conta." }, { status: 409 });
    }

    const now = new Date();
    const scheduled = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const { error } = await admin
      .from("profiles")
      .update({
        account_deletion_requested_at: now.toISOString(),
        account_deletion_scheduled_for: scheduled.toISOString(),
        account_deletion_canceled_at: null,
        account_deletion_reason: text(body?.reason).slice(0, 500) || null,
        updated_at: now.toISOString(),
      })
      .eq("id", userId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, scheduledFor: scheduled.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao solicitar encerramento." }, { status: 500 });
  }
}

export async function PATCH() {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient() as any;
    const { error } = await admin
      .from("profiles")
      .update({
        account_deletion_requested_at: null,
        account_deletion_scheduled_for: null,
        account_deletion_canceled_at: now,
        updated_at: now,
      })
      .eq("id", userId);

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cancelar encerramento." }, { status: 500 });
  }
}
