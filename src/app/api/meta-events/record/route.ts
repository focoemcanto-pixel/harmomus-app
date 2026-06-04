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

function buildAttribution(payload: Record<string, unknown>) {
  return ATTRIBUTION_KEYS.reduce<Record<(typeof ATTRIBUTION_KEYS)[number], string | null>>((acc, key) => {
    acc[key] = clean(payload[key]);
    return acc;
  }, {} as Record<(typeof ATTRIBUTION_KEYS)[number], string | null>);
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

    // Campos canônicos: precisam bater exatamente com os cabeçalhos da planilha/webhook.
    utm_source: input.attribution.utm_source,
    utm_medium: input.attribution.utm_medium,
    utm_campaign: input.attribution.utm_campaign,
    utm_term: input.attribution.utm_term,
    utm_content: input.attribution.utm_content,
    fbclid: input.attribution.fbclid,
    gclid: input.attribution.gclid,

    // Aliases descritivos mantidos para compatibilidade com versões antigas do Apps Script.
    utm_medium_publico_conjunto: input.attribution.utm_medium,
    utm_term_posicionamento: input.attribution.utm_term,
    utm_content_criativo: input.attribution.utm_content,

    plan: clean(input.payload.plan, 120),
    value: input.payload.value ?? null,
    event_source_url: input.url,
    user_agent: input.userAgent,
  };
}

async function syncToSheets(row: Record<string, unknown>) {
  const webhookUrl = process.env.META_FUNNEL_SHEETS_WEBHOOK_URL;
  const configured = Boolean(webhookUrl);
  console.log("[META SHEETS] webhook configured:", configured);

  if (!webhookUrl) return { skipped: true, configured: false };

  try {
    console.log("[META SHEETS] sending event:", row.event_name, {
      utm_source: row.utm_source,
      utm_medium: row.utm_medium,
      utm_campaign: row.utm_campaign,
      utm_term: row.utm_term,
      utm_content: row.utm_content,
    });
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(row),
    });
    const responseText = await response.text().catch(() => "");
    console.log("[META SHEETS] response:", response.status, responseText.slice(0, 300));

    return { skipped: false, configured: true, ok: response.ok, status: response.status, body: responseText.slice(0, 500) };
  } catch (error) {
    console.error("[META SHEETS] failed:", error);
    return { skipped: false, configured: true, ok: false, error: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}

export async function GET() {
  const testEventName = "Lead_free_signup";
  const payload = {
    utm_source: "MetaAds",
    utm_medium: "DiagnosticoWebhook",
    utm_campaign: "TESTE_SHEETS_GET",
    utm_term: "manual_get",
    utm_content: "diagnostico",
    event_id: `sheets-get-${Date.now()}`,
  };
  const attribution = buildAttribution(payload);
  const eventId = clean(payload.event_id, 180);
  const sheets = await syncToSheets(sheetRow({ eventName: testEventName, eventId, attribution, url: "manual-diagnostic-get", userAgent: "manual-diagnostic", payload }));

  return NextResponse.json({
    ok: true,
    diagnostic: true,
    webhookConfigured: Boolean(process.env.META_FUNNEL_SHEETS_WEBHOOK_URL),
    sheets,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.eventName, 120);
    if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ ok: false, error: "Evento inválido." }, { status: 400 });
    }

    const payload = cleanPayload(body.payload);
    const attribution = buildAttribution(payload);

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

    const row = sheetRow({ eventName, eventId, attribution, url: eventSourceUrl, userAgent, payload });
    const sheets = await syncToSheets(row);
    return NextResponse.json({ ok: true, eventName, sheets, webhookConfigured: Boolean(process.env.META_FUNNEL_SHEETS_WEBHOOK_URL) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao registrar evento." }, { status: 500 });
  }
}
