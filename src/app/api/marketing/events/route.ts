import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { trackMarketingEvent } from "@/lib/communications/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PUBLIC_EVENT_KEYS = new Set(["open", "click", "conversion"]);
const AUTHENTICATED_BEHAVIOR_EVENT_KEYS = new Set([
  "checkout_started",
  "checkout_completed",
  "premium_blocked",
  "tone_blocked",
  "audio_played",
  "playlist_created",
  "kit_viewed",
  "subscription_created",
  "payment_failed",
]);
const EVENT_KEYS = new Set([...PUBLIC_EVENT_KEYS, ...AUTHENTICATED_BEHAVIOR_EVENT_KEYS]);
const TRANSPARENT_PIXEL = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeUuid(value: unknown) {
  const text = sanitizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text) ? text : null;
}

function sanitizeUrl(value: unknown) {
  const text = sanitizeText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolvePagePath(request: Request) {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.pathname}${url.search}`;
  } catch {
    return referer.slice(0, 200);
  }
}

function resolveDeviceType(request: Request) {
  const ua = String(request.headers.get("user-agent") ?? "").toLowerCase();
  if (/mobile|android|iphone|ipad|ipod/.test(ua)) return "mobile";
  return "desktop";
}

function eventKeyFromRequest(request: Request, body?: Record<string, unknown> | null) {
  const url = new URL(request.url);
  const key = sanitizeText(body?.event_key ?? body?.eventKey ?? body?.event_type ?? body?.event ?? url.searchParams.get("event_key") ?? url.searchParams.get("event")).toLowerCase();
  return EVENT_KEYS.has(key) ? key : null;
}

async function updateDeliveryMetrics(supabase: ReturnType<typeof createSupabaseAdminClient>, eventKey: string, metadata: Record<string, unknown>, userId: string | null) {
  const now = new Date().toISOString();
  const jobId = sanitizeUuid(metadata.job_id);
  const campaignId = sanitizeUuid(metadata.campaign_id);
  const providerMessageId = sanitizeText(metadata.provider_message_id) || null;
  const timestampColumn = eventKey === "open" ? "opened_at" : eventKey === "click" ? "clicked_at" : "converted_at";
  const status = eventKey === "open" ? "opened" : eventKey === "click" ? "clicked" : "converted";
  const patch = { [timestampColumn]: now, status, updated_at: now };

  if (jobId) await supabase.from("communication_deliveries").update(patch).eq("queue_id", jobId);
  if (providerMessageId) await supabase.from("communication_deliveries").update(patch).eq("provider_message_id", providerMessageId);
  if (campaignId && userId) await supabase.from("communication_deliveries").update(patch).eq("campaign_id", campaignId).eq("user_id", userId);
}

function publicEventLabel(eventKey: string) {
  if (eventKey === "open") return "Abertura";
  if (eventKey === "click") return "Clique";
  if (eventKey === "conversion") return "Conversão";
  return eventKey;
}

async function recordEvent(request: Request, body?: Record<string, unknown> | null) {
  const url = new URL(request.url);
  const eventKey = eventKeyFromRequest(request, body);
  if (!eventKey) return { ok: false as const, error: "Evento inválido." };

  const isPublicEvent = PUBLIC_EVENT_KEYS.has(eventKey);
  const supabase = createSupabaseAdminClient();

  let userId = sanitizeUuid(body?.user_id ?? url.searchParams.get("user_id"));
  let effectiveSlug: string | null = null;

  if (!isPublicEvent) {
    const current = await getCurrentUserAccessContext();
    userId = current.profile?.id ?? null;
    effectiveSlug = current.effectiveSlug ?? null;
    if (!userId) return { ok: false as const, error: "Usuário não autenticado." };
  }

  const metadata = isPublicEvent
    ? {
        job_id: sanitizeUuid(body?.job_id ?? url.searchParams.get("job_id")),
        campaign_id: sanitizeUuid(body?.campaign_id ?? url.searchParams.get("campaign_id")),
        provider_message_id: sanitizeText(body?.provider_message_id ?? url.searchParams.get("provider_message_id")) || null,
        url: sanitizeUrl(body?.url ?? url.searchParams.get("url")),
        user_agent: request.headers.get("user-agent"),
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }
    : {
        ...sanitizeMetadata(body?.metadata),
        plan_slug: effectiveSlug,
        page_path: sanitizeText(body?.page_path ?? body?.pagePath) || resolvePagePath(request),
        device_type: resolveDeviceType(request),
        user_agent: request.headers.get("user-agent"),
      };

  await trackMarketingEvent(supabase as any, {
    userId,
    eventKey,
    eventLabel: sanitizeText(body?.event_label ?? body?.eventLabel) || (isPublicEvent ? publicEventLabel(eventKey) : eventKey),
    channel: sanitizeText(body?.channel ?? url.searchParams.get("channel")) || (isPublicEvent ? undefined : "app"),
    metadata,
  });

  if (isPublicEvent) await updateDeliveryMetrics(supabase, eventKey, metadata, userId);

  return { ok: true as const, eventKey, metadata };
}

export async function GET(request: Request) {
  const result = await recordEvent(request);
  const url = new URL(request.url);
  const redirectTo = result.ok && result.eventKey === "click" ? sanitizeUrl(url.searchParams.get("url")) : null;

  if (redirectTo) return NextResponse.redirect(redirectTo, { status: 302 });

  return new NextResponse(TRANSPARENT_PIXEL, {
    status: result.ok ? 200 : 400,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = await recordEvent(request, body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "Usuário não autenticado." ? 401 : 400 });
  return NextResponse.json({ data: { ok: true, event_key: result.eventKey } });
}
