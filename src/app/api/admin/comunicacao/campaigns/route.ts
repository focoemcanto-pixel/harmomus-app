import { NextResponse } from "next/server";

import { getCreatedBy, requireAdmin, sanitizeObject, sanitizeStringArray, sanitizeText } from "../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("communication_campaigns")
    .select("id,created_at,updated_at,name,status,channel,audience_type,segment_slug,message,scheduled_at,preview_payload")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: (data ?? []).map((campaign) => ({
    ...campaign,
    channels: campaign.channel ? [campaign.channel] : [],
    audience_filters: { segment: campaign.segment_slug, audience_type: campaign.audience_type, ...(campaign.preview_payload ?? {}) },
    title: (campaign.preview_payload as Record<string, unknown> | null)?.title ?? campaign.name,
    link_url: (campaign.preview_payload as Record<string, unknown> | null)?.link_url ?? null,
    schedule_mode: campaign.scheduled_at ? "scheduled" : "now",
    stats: campaign.preview_payload ?? {},
  })) });
}

export async function POST(request: Request) {
  const { admin, current, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const name = sanitizeText(body.name);
  const message = sanitizeText(body.message);
  const channels = sanitizeStringArray(body.channels, CHANNELS);
  const scheduleMode = sanitizeText(body.schedule_mode) === "scheduled" ? "scheduled" : "now";
  const scheduledAt = scheduleMode === "scheduled" ? sanitizeText(body.scheduled_at) : "";

  if (!name) return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Mensagem da campanha é obrigatória." }, { status: 400 });
  if (!channels.length) return NextResponse.json({ error: "Selecione pelo menos um canal." }, { status: 400 });

  const record = {
    name,
    status: "draft",
    channel: (channels[0] ?? "whatsapp") as "whatsapp" | "email",
    audience_type: sanitizeText(sanitizeObject(body.audience_filters).segment) || "custom",
    segment_slug: sanitizeText(sanitizeObject(body.audience_filters).segment) || null,
    message,
    preview_payload: {
      ...sanitizeObject(body.audience_filters),
      channels,
      title: sanitizeText(body.title) || null,
      link_url: sanitizeText(body.link_url) || null,
      schedule_mode: scheduleMode,
      rate_limits: sanitizeObject(body.rate_limits),
    },
    scheduled_at: scheduledAt || null,
    created_by: getCreatedBy(current.profile?.id),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("communication_campaigns")
    .insert(record)
    .select("id,created_at,updated_at,name,status,channel,audience_type,segment_slug,message,scheduled_at,preview_payload")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ? {
    ...data,
    channels: data.channel ? [data.channel] : [],
    audience_filters: { segment: data.segment_slug, audience_type: data.audience_type, ...(data.preview_payload ?? {}) },
    title: (data.preview_payload as Record<string, unknown> | null)?.title ?? data.name,
    link_url: (data.preview_payload as Record<string, unknown> | null)?.link_url ?? null,
    schedule_mode: data.scheduled_at ? "scheduled" : "now",
    stats: data.preview_payload ?? {},
  } : data }, { status: 201 });
}
