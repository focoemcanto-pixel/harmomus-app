import { NextResponse } from "next/server";

import { getCreatedBy, requireAdmin, sanitizeObject, sanitizeStringArray, sanitizeText } from "../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

function readContent(value: unknown) {
  return sanitizeObject(value);
}

function readChannels(content: Record<string, unknown>, channel?: string | null) {
  const fromContent = sanitizeStringArray(content.channels, CHANNELS);
  if (fromContent.length) return fromContent;
  return channel ? [channel] : [];
}

function buildResponse(campaign: Record<string, unknown>) {
  const content = readContent(campaign.content);
  const audienceFilters = sanitizeObject(content.audience_filters);
  const title = sanitizeText(content.title) || sanitizeText(campaign.subject) || sanitizeText(campaign.name);
  const textContent = sanitizeText(campaign.text_content);

  return {
    ...campaign,
    content,
    message: textContent,
    channels: readChannels(content, sanitizeText(campaign.channel)),
    audience_filters: {
      ...audienceFilters,
      audience_type: sanitizeText(campaign.audience_type),
    },
    title,
    link_url: sanitizeText(content.link_url) || null,
    media_url: sanitizeText(content.media_url ?? content.mediaUrl) || null,
    kit_id: sanitizeText(content.kit_id ?? content.kitId) || null,
    schedule_mode: campaign.scheduled_at ? "scheduled" : sanitizeText(content.schedule_mode) || "now",
    stats: sanitizeObject(content.stats) || content,
  };
}

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error } = await admin
    .from("communication_campaigns")
    .select("id,created_at,updated_at,name,status,channel,audience_type,subject,text_content,scheduled_at,content")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: (data ?? []).map((campaign) => buildResponse(campaign as Record<string, unknown>)) });
}

export async function POST(request: Request) {
  const { admin, current, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const name = sanitizeText(body.name);
  const message = sanitizeText(body.message ?? body.text_content ?? body.text);
  const channels = sanitizeStringArray(body.channels, CHANNELS);
  const audienceFilters = sanitizeObject(body.audience_filters);
  const scheduleMode = sanitizeText(body.schedule_mode) === "scheduled" ? "scheduled" : "now";
  const scheduledAt = scheduleMode === "scheduled" ? sanitizeText(body.scheduled_at) : "";
  const title = sanitizeText(body.title) || name;

  if (!name) return NextResponse.json({ error: "Nome da campanha é obrigatório." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Mensagem da campanha é obrigatória." }, { status: 400 });
  if (!channels.length) return NextResponse.json({ error: "Selecione pelo menos um canal." }, { status: 400 });

  const content = {
    title,
    link_url: sanitizeText(body.link_url) || null,
    media_url: sanitizeText(body.media_url ?? body.mediaUrl) || null,
    kit_id: sanitizeText(body.kit_id ?? body.kitId) || null,
    channels,
    schedule_mode: scheduleMode,
    rate_limits: sanitizeObject(body.rate_limits),
    audience_filters: audienceFilters,
  };

  const { data, error } = await admin
    .from("communication_campaigns")
    .insert({
      name,
      status: "draft",
      channel: channels[0] ?? "whatsapp",
      audience_type: sanitizeText(audienceFilters.segment ?? audienceFilters.audience_type) || "custom",
      subject: title,
      preview_text: message.slice(0, 180),
      text_content: message,
      content,
      scheduled_at: scheduledAt || null,
      created_by: getCreatedBy(current.profile?.id),
      updated_at: new Date().toISOString(),
    })
    .select("id,created_at,updated_at,name,status,channel,audience_type,subject,text_content,scheduled_at,content")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ? buildResponse(data as Record<string, unknown>) : data }, { status: 201 });
}
