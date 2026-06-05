import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_EVENTS = new Set(["Lead_free_signup", "CompleteRegistration_first_login", "CompleteRegistration_email_confirmed", "InitiateCheckout_premium", "Purchase_premium"]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"] as const;
const ALWAYS_SYNC_TO_SHEETS_EVENTS = new Set(["Lead_free_signup"]);
const CAMPAIGN_PURCHASE_EVENTS = new Set(["Purchase_premium"]);
const SHEETS_TIME_ZONE = "America/Bahia";

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

function hasCampaignAttribution(attribution: Record<(typeof ATTRIBUTION_KEYS)[number], string | null>) {
  return Boolean(attribution.utm_source || attribution.utm_campaign || attribution.fbclid);
}

function shouldSyncToSheets(eventName: string, attribution: Record<(typeof ATTRIBUTION_KEYS)[number], string | null>) {
  if (ALWAYS_SYNC_TO_SHEETS_EVENTS.has(eventName)) return true;
  if (CAMPAIGN_PURCHASE_EVENTS.has(eventName)) return hasCampaignAttribution(attribution);
  return false;
}

function formatSheetTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: SHEETS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function extractEmail(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase() ?? null;
}

function getCustomerEmail(input: { eventId: string | null; payload: Record<string, unknown> }) {
  return (
    extractEmail(input.payload.email) ||
    extractEmail(input.payload.customer_email) ||
    extractEmail(input.payload.user_email) ||
    extractEmail(input.eventId)
  );
}

function normalizeSheetEventId(eventName: string, eventId: string | null) {
  if (!eventId) return null;
  if (eventName === "Lead_free_signup" && extractEmail(eventId)) return eventName;
  return eventId;
}

function sheetRow(input: {
  eventName: string;
  eventId: string | null;
  attribution: Record<(typeof ATTRIBUTION_KEYS)[number], string | null>;
  url: string | null;
  userAgent: string | null;
  payload: Record<string, unknown>;
}) {
  const customerEmail = getCustomerEmail({ eventId: input.eventId, payload: input.payload });

  return {
    created_at: formatSheetTimestamp(),
    created_at_utc: new Date().toISOString(),
    timezone: SHEETS_TIME_ZONE,
    event_name: input.eventName,
    event_id: normalizeSheetEventId(input.eventName, input.eventId),
    customer_email: customerEmail,

    // Campos canonicos: precisam bater exatamente com os cabecalhos da planilha/webhook.
    utm_source: input.attribution.utm_source,
    utm_medium: input.attribution.utm_medium,
    utm_campaign: input.attribution.utm_campaign,
    utm_term: input.attribution.utm_term,
    utm_content: input.attribution.utm_content,
    fbclid: input.attribution.fbclid,
    gclid: input.attribution.gclid,

    // Aliases descritivos mantidos para compatibilidade com versoes antigas do Apps Script.
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

  if (!webhookUrl) return { skipped: true, configured: false, reason: "webhook_not_configured" };

  try {
    console.log("[META SHEETS] sending event:", row.event_name, {
      customer_email: row.customer_email,
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
    email: "teste_direto_apps_script@harmomus.com",
    utm_source: "MetaAds",
    utm_medium: "DiagnosticoWebhook",
    utm_campaign: "TESTE_SHEETS_GET",
    utm_term: "manual_get",
    utm_content: "diagnostico",
    event_id: `Lead_teste_direto_apps_script@harmomus.com`,
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
    const shouldSync = shouldSyncToSheets(eventName, attribution);
    const sheets = shouldSync
      ? await syncToSheets(row)
      : { skipped: true, configured: Boolean(process.env.META_FUNNEL_SHEETS_WEBHOOK_URL), reason: "event_not_allowed_for_sheets" };

    if (!shouldSync) {
      console.log("[META SHEETS] skipped event:", eventName, {
        reason: "event_not_allowed_for_sheets",
        has_campaign_attribution: hasCampaignAttribution(attribution),
      });
    }

    return NextResponse.json({ ok: true, eventName, sheets, webhookConfigured: Boolean(process.env.META_FUNNEL_SHEETS_WEBHOOK_URL) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao registrar evento." }, { status: 500 });
  }
}
