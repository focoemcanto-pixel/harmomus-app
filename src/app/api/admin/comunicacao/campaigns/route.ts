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

type QueueStats = {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  processing: number;
  paused: number;
  canceled: number;
};

const QUEUE_STATUSES = ["pending", "sent", "failed", "processing", "paused", "canceled"] as const;

async function getQueueStats(admin: any, campaignId: string): Promise<QueueStats> {
  const stats: QueueStats = {
    total: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    processing: 0,
    paused: 0,
    canceled: 0,
  };

  const { count: total, error: totalError } = await admin
    .from("communication_queue")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (totalError) throw new Error(totalError.message);
  stats.total = total ?? 0;

  await Promise.all(
    QUEUE_STATUSES.map(async (status) => {
      const { count, error } = await admin
        .from("communication_queue")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", status);
      if (error) throw new Error(error.message);
      stats[status] = count ?? 0;
    }),
  );

  return stats;
}

function readContent(value: unknown) {
  return sanitizeObject(value);
}

function readChannels(
  content: Record<string, unknown>,
  channel?: string | null,
) {
  const fromContent = sanitizeStringArray(content.channels, CHANNELS);
  if (fromContent.length) return fromContent;
  return channel ? [channel] : [];
}

async function buildResponse(admin: any, campaign: Record<string, unknown>) {
  const content = readContent(campaign.content);
  const audienceFilters = sanitizeObject(content.audience_filters);
  const title =
    sanitizeText(content.title) ||
    sanitizeText(campaign.subject) ||
    sanitizeText(campaign.name);
  const textContent = sanitizeText(campaign.text_content);

  const audiencePreview = await getCampaignAudiencePreview(
    audienceFilters.plans,
  );

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
    schedule_mode: campaign.scheduled_at
      ? "scheduled"
      : sanitizeText(content.schedule_mode) || "now",
    stats: sanitizeObject(content.stats) || content,
    queue_stats: await getQueueStats(admin, String(campaign.id ?? "")),
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
      "id,created_at,updated_at,name,status,channel,audience_type,subject,text_content,scheduled_at,content",
    )
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: await Promise.all(
      (data ?? []).map((campaign) =>
        buildResponse(admin, campaign as Record<string, unknown>),
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
      channel: channels[0] ?? "whatsapp",
      audience_type:
        sanitizeText(
          audienceFilters.segment ?? audienceFilters.audience_type,
        ) || "custom",
      subject: title,
      preview_text: message.slice(0, 180),
      text_content: message,
      content,
      scheduled_at: scheduledAt || null,
      created_by: getCreatedBy(current.profile?.id),
      updated_at: new Date().toISOString(),
    })
    .select(
      "id,created_at,updated_at,name,status,channel,audience_type,subject,text_content,scheduled_at,content",
    )
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      data: data ? await buildResponse(admin, data as Record<string, unknown>) : data,
    },
    { status: 201 },
  );
}
