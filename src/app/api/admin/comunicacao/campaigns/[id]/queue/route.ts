import { NextResponse } from "next/server";

import {
  enqueueCampaignAudience,
  enqueueCampaignAudienceFromPlans,
} from "@/lib/communication/service";
import type { Channel } from "@/types/communication";
import {
  requireAdmin,
  sanitizeObject,
  sanitizeText,
} from "../../../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const channel = sanitizeText(body?.channel);
  const audienceIds = asStringArray(
    body?.audienceIds ?? body?.audience_ids ?? body?.userIds ?? body?.user_ids,
  );

  const { data: campaign, error: campaignError } = await admin
    .from("communication_campaigns")
    .select("text_content,content")
    .eq("id", id)
    .maybeSingle();

  if (campaignError)
    return NextResponse.json({ error: campaignError.message }, { status: 500 });

  const campaignContent = sanitizeObject(campaign?.content);
  const audienceFilters = sanitizeObject(campaignContent.audience_filters);
  const hasMessageOverride =
    Boolean(body) &&
    (Object.prototype.hasOwnProperty.call(body, "message") ||
      Object.prototype.hasOwnProperty.call(body, "text") ||
      Object.prototype.hasOwnProperty.call(body, "mensagem"));
  const message = hasMessageOverride
    ? sanitizeText(body?.message ?? body?.text ?? body?.mensagem)
    : sanitizeText(campaign?.text_content);
  const mediaUrl =
    sanitizeText(
      body?.mediaUrl ?? body?.media_url ?? body?.imageUrl ?? body?.image,
    ) || sanitizeText(campaignContent.media_url ?? campaignContent.mediaUrl);

  if (!CHANNELS.has(channel))
    return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
  if (!message)
    return NextResponse.json(
      { error: "Informe a mensagem da campanha." },
      { status: 400 },
    );

  try {
    const linkUrl =
      sanitizeText(body?.link ?? body?.link_url) ||
      sanitizeText(campaignContent.link_url ?? campaignContent.linkUrl);
    const plan =
      sanitizeText(body?.plano ?? body?.plan) ||
      asStringArray(audienceFilters.plans).join(", ");
    const payload = {
      ...(mediaUrl ? { mediaUrl, media_url: mediaUrl } : {}),
      ...(linkUrl ? { link: linkUrl, link_url: linkUrl } : {}),
      ...(plan ? { plano: plan, plan } : {}),
    };
    const result = audienceIds.length
      ? await enqueueCampaignAudience(
          id,
          audienceIds,
          channel as Channel,
          message,
          payload,
        )
      : await enqueueCampaignAudienceFromPlans(
          id,
          audienceFilters.plans,
          channel as Channel,
          message,
          payload,
        );
    return NextResponse.json({
      data: {
        campaign_id: id,
        channel,
        queued: result.queued,
        status: "queued",
        audience_preview: "preview" in result ? result.preview : null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao enfileirar campanha.",
      },
      { status: 500 },
    );
  }
}
