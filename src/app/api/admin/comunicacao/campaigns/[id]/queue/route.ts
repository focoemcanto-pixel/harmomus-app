import { NextResponse } from "next/server";

import {
  enqueueCampaignContacts,
  type AudienceContact,
} from "@/lib/communication/campaign-audience";
import { enqueueCampaignAudience } from "@/lib/communication/service";
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

function normalizePhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function sanitizeAudienceContacts(value: unknown): AudienceContact[] {
  if (!Array.isArray(value)) return [];

  const byPhone = new Map<string, AudienceContact>();
  for (const item of value) {
    const row = sanitizeObject(item);
    const phone = normalizePhone(row.phone_normalized ?? row.phone);
    if (!phone || phone.length < 12) continue;

    const source = sanitizeText(row.source) === "legacy" ? "legacy" : "current";
    const contact: AudienceContact = {
      id: sanitizeText(row.id) || `${source}:${phone}`,
      user_id: sanitizeText(row.user_id) || null,
      source,
      plan: sanitizeText(row.plan) || "free",
      name: sanitizeText(row.name) || null,
      email: sanitizeText(row.email) || null,
      phone: sanitizeText(row.phone) || phone,
      phone_normalized: phone,
    };

    const existing = byPhone.get(phone);
    if (!existing || (existing.source === "legacy" && source === "current")) {
      byPhone.set(phone, contact);
    }
  }

  return Array.from(byPhone.values());
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
  const contacts = sanitizeAudienceContacts(body?.contacts);
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
  const message =
    sanitizeText(body?.message ?? body?.text ?? body?.mensagem) ||
    sanitizeText(campaign?.text_content);
  const mediaUrl =
    sanitizeText(body?.mediaUrl ?? body?.media_url ?? body?.imageUrl ?? body?.image) ||
    sanitizeText(campaignContent.media_url ?? campaignContent.mediaUrl);

  if (!CHANNELS.has(channel))
    return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
  if (!contacts.length && !audienceIds.length)
    return NextResponse.json(
      { error: "Atualize a audiência e selecione ao menos um contato para enfileirar." },
      { status: 400 },
    );
  if (!message)
    return NextResponse.json(
      { error: "Informe a mensagem da campanha." },
      { status: 400 },
    );

  try {
    const result = contacts.length
      ? await enqueueCampaignContacts({
          campaignId: id,
          channel: channel as Channel,
          message,
          payload: mediaUrl ? { mediaUrl, media_url: mediaUrl } : {},
          contacts,
        })
      : await enqueueCampaignAudience(
          id,
          audienceIds,
          channel as Channel,
          message,
          mediaUrl ? { mediaUrl, media_url: mediaUrl } : {},
        );

    return NextResponse.json({
      data: { campaign_id: id, channel, queued: result.queued, status: "queued" },
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
