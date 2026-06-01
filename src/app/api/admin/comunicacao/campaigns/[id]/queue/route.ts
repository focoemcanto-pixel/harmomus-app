import { NextResponse } from "next/server";

import { enqueueCampaignAudience } from "@/lib/communication/service";
import type { Channel } from "@/types/communication";
import { requireAdmin, sanitizeText } from "../../../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(item)).filter(Boolean);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const channel = sanitizeText(body?.channel);
  const audienceIds = asStringArray(body?.audienceIds ?? body?.audience_ids ?? body?.userIds ?? body?.user_ids);
  const message = sanitizeText(body?.message ?? body?.text ?? body?.mensagem);

  if (!CHANNELS.has(channel)) return NextResponse.json({ error: "Canal inválido." }, { status: 400 });
  if (!audienceIds.length) return NextResponse.json({ error: "Selecione ao menos um contato para enfileirar." }, { status: 400 });
  if (!message) return NextResponse.json({ error: "Informe a mensagem da campanha." }, { status: 400 });

  try {
    const result = await enqueueCampaignAudience(id, audienceIds, channel as Channel, message);
    return NextResponse.json({ data: { campaign_id: id, channel, queued: result.queued, status: "queued" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enfileirar campanha." }, { status: 500 });
  }
}
