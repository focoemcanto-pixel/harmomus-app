import { NextResponse } from "next/server";

import { getCampaignAudiencePreview } from "@/lib/communication/service";
import {
  getCreatedBy,
  requireAdmin,
  sanitizeObject,
  sanitizeStringArray,
  sanitizeText,
} from "../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

function readContent(value: unknown) {
  return sanitizeObject(value);
}

function readChannels(campaign: Record<string, unknown>, content: Record<string, unknown>) {
  const fromCampaign = sanitizeStringArray(campaign.channels, CHANNELS);
  if (fromCampaign.length) return fromCampaign;
  const fromContent = sanitizeStringArray(content.channels, CHANNELS);
  if (fromContent.length) return fromContent;
  return [];
}

async function buildResponse(campaign: Record<string, unknown>) {
  const content = readContent(campaign.content);
  const audienceFilters = sanitizeObject(campaign.audience_filters ?? content.audience_filters);
  const title =
    sanitizeText(campaign.title) ||
    sanitizeText(content.title) ||
    sanitizeText(campaign.name);
  const textContent = sanitizeText(campaign.message ?? content.message ?? content.text_content);

  const audiencePreview = await getCampaignAudiencePreview(
    audienceFilters.plans,
  );

  return {
    ...campaign,
    content,
    message: textContent,
    text_content: textContent,
    channels: readChannels(campaign, content),
    audience_filters: {
      ...audienceFilters,
      audience_type: sanitizeText(campaign.audience_type ?? audienceFilters.audience_type),
    },
    title,
    link_url: sanitizeText(campaign.link_url ?? content.link_url) || null,
    media_url: sanitizeText(content.media_url ?? content.mediaUrl) || null,
    kit_id: sanitizeText(content.kit_id ?? content.kitId) || null,
    schedule_mode: sanitizeText(campaign.schedule_mode) || (campaign.scheduled_at ? "scheduled" : "now"),
    stats: sanitizeObject(campaign.stats ?? content.stats),
    audience_preview: audiencePreview,
  };
}

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const url = new URL(request.url);
  const previewPlans = url.searchParams.get("plans");
  if (previewPlans !== null) {
    const plans = previewPlans
      .split(",")
      .map((plan) => plan.trim())
      .filter(Boolean);
    return NextResponse.json({
      data: { audience_preview: await getCampaignAudiencePreview(plans) },
    });
  }

  const { data, error } = await admin
    .from("communication_campaigns")
    .select(
      "id,created_at,updated_at,name,status,title,message,link_url,channels,audience_filters,schedule_mode,scheduled_at,stats",
    )
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: await Promise.all(
      (data ?? []).map((campaign) =>
        buildResponse(campaign as Record<string, unknown>),
      ),
    ),
  });
}

export async function POST(request: Request) {
  const { admin, current, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const name = sanitizeText(body.name);
  const message = sanitizeText(body.message ?? body.text_content ?? body.text);
  const channels = sanitizeStringArray(body.channels, CHANNELS);
  const audienceFilters = sanitizeObject(body.audience_filters);
  const scheduleMode =
    sanitizeText(body.schedule_mode) === "scheduled" ? "scheduled" : "now";
  const scheduledAt =
    scheduleMode === "scheduled" ? sanitizeText(body.scheduled_at) : "";
  const title = sanitizeText(body.title) || name;

  if (!name)
    return NextResponse.json(
      { error: "Nome da campanha é obrigatório." },
      { status: 400 },
    );
  if (!message)
    return NextResponse.json(
      { error: "Mensagem da campanha é obrigatória." },
      { status: 400 },
    );
  if (!channels.length)
    return NextResponse.json(
      { error: "Selecione pelo menos um canal." },
      { status: 400 },
    );

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
      title,
      message,
      link_url: sanitizeText(body.link_url) || null,
      channels,
      audience_filters: audienceFilters,
      schedule_mode: scheduleMode,
      scheduled_at: scheduledAt || null,
      stats: { queued: 0, sent: 0, failed: 0 },
      created_by: getCreatedBy(current.profile?.id),
      updated_at: new Date().toISOString(),
    })
    .select(
      "id,created_at,updated_at,name,status,title,message,link_url,channels,audience_filters,schedule_mode,scheduled_at,stats",
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      data: data ? await buildResponse(data as Record<string, unknown>) : data,
    },
    { status: 201 },
  );
}
