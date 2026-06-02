import { NextResponse } from "next/server";

import { processCommunicationQueue } from "@/lib/communication/marketing-queue";
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
    .select("message,audience_filters,scheduled_at,schedule_mode")
    .eq("id", id)
    .maybeSingle();

  if (campaignError)
    return NextResponse.json({ error: campaignError.message }, { status: 500 });

  const audienceFilters = sanitizeObject(campaign?.audience_filters);
  const message =
    sanitizeText(body?.message ?? body?.text ?? body?.mensagem) ||
    sanitizeText(campaign?.message);
  const mediaUrl =
    sanitizeText(
      body?.mediaUrl ?? body?.media_url ?? body?.imageUrl ?? body?.image,
    );

  if (!CHANNELS.has(channel))
    return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
  if (!message)
    return NextResponse.json(
      { error: "Informe a mensagem da campanha." },
      { status: 400 },
    );

  try {
    const payload = mediaUrl ? { mediaUrl, media_url: mediaUrl } : {};
    const result = audienceIds.length
      ? await enqueueCampaignAudience(
          id,
          audienceIds,
          channel as Channel,
          message,
          payload,
          campaign?.scheduled_at ?? null,
        )
      : await enqueueCampaignAudienceFromPlans(
          id,
          audienceFilters.plans,
          channel as Channel,
          message,
          payload,
          campaign?.scheduled_at ?? null,
        );
    const nextStatus = campaign?.schedule_mode === "scheduled" || campaign?.scheduled_at ? "scheduled" : "queued";

    await admin
      .from("communication_campaigns")
      .update({
        status: nextStatus,
        stats: { queued: result.queued, sent: 0, failed: 0 },
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    const processingResult = nextStatus === "queued" ? await processCommunicationQueue(25) : null;

    return NextResponse.json({
      data: {
        campaign_id: id,
        channel,
        queued: result.queued,
        status: nextStatus,
        audience_preview: "preview" in result ? result.preview : null,
        worker: processingResult,
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
