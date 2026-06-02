import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_EVENTS = new Set(["Lead_free_signup", "CompleteRegistration_first_login", "InitiateCheckout_premium", "Purchase_premium"]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;

function clean(value: unknown, maxLength = 500) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function cleanPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};

  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>)
      .map(([key, value]) => [key.slice(0, 100), typeof value === "string" ? value.slice(0, 1000) : value])
      .filter(([key]) => Boolean(key)),
  );
}

function sheetRow(input: {
  eventName: string;
  eventId: string | null;
  attribution: Record<(typeof ATTRIBUTION_KEYS)[number], string | null>;
  url: string | null;
  userAgent: string | null;
  payload: Record<string, unknown>;
}) {
  return {
    created_at: new Date().toISOString(),
    event_name: input.eventName,
    event_id: input.eventId,
    utm_source: input.attribution.utm_source,
    utm_medium_publico_conjunto: input.attribution.utm_medium,
    utm_campaign: input.attribution.utm_campaign,
    utm_term_posicionamento: input.attribution.utm_term,
    utm_content_criativo: input.attribution.utm_content,
    fbclid: input.attribution.fbclid,
    gclid: input.attribution.gclid,
    plan: clean(input.payload.plan, 120),
    value: input.payload.value ?? null,
    event_source_url: input.url,
    user_agent: input.userAgent,
  };
}

async function syncToSheets(row: Record<string, unknown>) {
  const webhookUrl = process.env.META_FUNNEL_SHEETS_WEBHOOK_URL;
  if (!webhookUrl) return { skipped: true };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });

    return { skipped: false, ok: response.ok, status: response.status };
  } catch (error) {
    console.error("[meta-events/record] Failed to sync event to Sheets", error);
    return { skipped: false, ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.eventName, 120);
    if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ ok: false, error: "Evento inválido." }, { status: 400 });
    }

    const payload = cleanPayload(body.payload);
    const attribution = ATTRIBUTION_KEYS.reduce<Record<(typeof ATTRIBUTION_KEYS)[number], string | null>>((acc, key) => {
      acc[key] = clean((payload as Record<string, unknown>)[key]);
      return acc;
    }, {} as Record<(typeof ATTRIBUTION_KEYS)[number], string | null>);

    const eventId = clean(body.eventId ?? (payload as Record<string, unknown>).event_id, 180);
    const eventSourceUrl = clean(body.url, 1000) ?? request.headers.get("referer");
    const userAgent = clean(request.headers.get("user-agent"), 1000);

    const supabase = createSupabaseAdminClient() as any;
    const { error } = await supabase.from("meta_funnel_events").insert({
      event_name: eventName,
      event_id: eventId,
      anonymous_id: clean(body.anonymousId, 180),
      event_source_url: eventSourceUrl,
      user_agent: userAgent,
      payload,
      ...attribution,
    });

    if (error && error.code === "23505") return NextResponse.json({ ok: true, eventName, duplicated: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const sheets = await syncToSheets(sheetRow({ eventName, eventId, attribution, url: eventSourceUrl, userAgent, payload }));
    return NextResponse.json({ ok: true, eventName, sheets });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao registrar evento." }, { status: 500 });
  }
}
