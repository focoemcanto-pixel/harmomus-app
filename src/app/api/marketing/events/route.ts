import { NextResponse } from "next/server";

import { trackMarketingEvent } from "@/lib/communications/events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const EVENT_TYPES = new Set(["open", "click", "conversion"]);
const TRANSPARENT_PIXEL = Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

function sanitizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeUuid(value: unknown) {
  const text = sanitizeText(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
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

function eventFromRequest(request: Request, body?: Record<string, unknown> | null) {
  const url = new URL(request.url);
  const type = sanitizeText(body?.event_type ?? body?.event ?? url.searchParams.get("event_type") ?? url.searchParams.get("event")).toLowerCase();
  return EVENT_TYPES.has(type) ? type : null;
}

async function recordEvent(request: Request, body?: Record<string, unknown> | null) {
  const url = new URL(request.url);
  const eventType = eventFromRequest(request, body);
  if (!eventType) return { ok: false as const, error: "Evento inválido." };

  const metadata = {
    job_id: sanitizeUuid(body?.job_id ?? url.searchParams.get("job_id")),
    campaign_id: sanitizeUuid(body?.campaign_id ?? url.searchParams.get("campaign_id")),
    provider_message_id: sanitizeText(body?.provider_message_id ?? url.searchParams.get("provider_message_id")) || null,
    url: sanitizeUrl(body?.url ?? url.searchParams.get("url")),
    user_agent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };

  const supabase = createSupabaseAdminClient();
  await trackMarketingEvent(supabase as any, {
    userId: sanitizeUuid(body?.user_id ?? url.searchParams.get("user_id")),
    eventType,
    channel: sanitizeText(body?.channel ?? url.searchParams.get("channel")) || undefined,
    metadata,
  });

  return { ok: true as const, eventType, metadata };
}

export async function GET(request: Request) {
  const result = await recordEvent(request);
  const url = new URL(request.url);
  const redirectTo = result.ok && result.eventType === "click" ? sanitizeUrl(url.searchParams.get("url")) : null;

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
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ data: { ok: true, event_type: result.eventType } });
}
