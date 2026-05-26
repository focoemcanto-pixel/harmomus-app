import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const ALLOWED_EVENTS = new Set([
  "purchase.completed",
  "subscription.created",
  "subscription.renewed",
  "subscription.canceled",
  "subscription.upgraded",
  "subscription.downgraded",
  "payment.failed",
  "campaign.started",
  "campaign.completed",
  "promotion.applied",
  "lead.created",
  "member.migrated",
]);

async function requireAdmin() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) return { error: "Não autenticado", status: 401 } as const;

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") return { error: "Acesso negado", status: 403 } as const;

  return { user } as const;
}

function buildTestPayload(event: string) {
  return {
    id: `evt_test_${crypto.randomUUID()}`,
    event,
    mode: "test",
    created_at: new Date().toISOString(),
    source: "harmomus",
    data: {
      member: {
        id: "user_test_123",
        name: "Usuário Teste Harmomus",
        email: "teste@harmomus.com",
        phone: "+55 71 99999-9999",
      },
      plan: {
        slug: event.includes("premium") ? "premium" : "plus",
        name: event.includes("premium") ? "Premium" : "Plus",
        amount_cents: event.includes("premium") ? 3900 : 1990,
        currency: "BRL",
      },
      transaction: {
        id: "pi_test_harmomus",
        status: event.includes("failed") ? "failed" : "paid",
        gateway: "stripe",
      },
      campaign: {
        slug: "campanha_teste",
        name: "Campanha de Teste",
        coupon: event.includes("promotion") ? "TESTE20" : null,
      },
    },
  };
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const url = String(body?.url ?? "").trim();
  const event = String(body?.event ?? "").trim();
  const secret = String(body?.secret ?? "").trim();

  if (!url || !/^https:\/\//i.test(url)) {
    return NextResponse.json({ error: "Informe uma URL HTTPS válida." }, { status: 400 });
  }

  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }

  const payload = buildTestPayload(event);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Harmomus-Webhooks/1.0",
        "X-Harmomus-Event": event,
        "X-Harmomus-Delivery": payload.id,
        ...(secret ? { "X-Harmomus-Secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text().catch(() => "");

    return NextResponse.json({
      ok: response.ok,
      status: response.status,
      duration_ms: Date.now() - startedAt,
      payload,
      response_body: text.slice(0, 2000),
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: 0,
      duration_ms: Date.now() - startedAt,
      payload,
      error: error instanceof Error ? error.message : "Falha ao enviar webhook.",
    }, { status: 502 });
  }
}
