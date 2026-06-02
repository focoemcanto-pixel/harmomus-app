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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.eventName, 120);
    if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ ok: false, error: "Evento inválido." }, { status: 400 });
    }

    const payload = cleanPayload(body.payload);
    const attribution = ATTRIBUTION_KEYS.reduce<Record<string, string | null>>((acc, key) => {
      acc[key] = clean((payload as Record<string, unknown>)[key]);
      return acc;
    }, {});

    const supabase = createSupabaseAdminClient() as any;
    const { error } = await supabase.from("meta_funnel_events").insert({
      event_name: eventName,
      event_id: clean(body.eventId ?? (payload as Record<string, unknown>).event_id, 180),
      anonymous_id: clean(body.anonymousId, 180),
      event_source_url: clean(body.url, 1000) ?? request.headers.get("referer"),
      user_agent: clean(request.headers.get("user-agent"), 1000),
      payload,
      ...attribution,
    });

    if (error && error.code === "23505") return NextResponse.json({ ok: true, eventName, duplicated: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, eventName });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao registrar evento." }, { status: 500 });
  }
}
