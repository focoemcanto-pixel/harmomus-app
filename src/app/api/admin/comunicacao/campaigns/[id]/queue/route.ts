import { NextResponse } from "next/server";

import { enqueueCampaignDeliveries } from "@/lib/communication/service";
import type { Channel } from "@/types/communication";
import { requireAdmin, sanitizeText } from "../../../_lib/marketing-api";

const CHANNELS = new Set(["whatsapp", "email"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const channel = sanitizeText(body?.channel);
  if (!CHANNELS.has(channel)) return NextResponse.json({ error: "Canal inválido." }, { status: 400 });

  try {
    const queued = await enqueueCampaignDeliveries(id, channel as Channel);
    return NextResponse.json({ data: { campaign_id: id, channel, queued, status: "queued" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao enfileirar campanha." }, { status: 500 });
  }
}
