import { NextResponse } from "next/server";

import { ensureFocoOsManualProvider } from "@/lib/communication/foco-os-provider";
import { processCommunicationQueue } from "@/lib/communication/marketing-queue";
import { processBehaviorMarketingAutomations } from "@/lib/communication/automation-engine-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const expected = String(process.env.FOCO_OS_COMMUNICATION_TOKEN || "").trim();
  if (!expected) {
    return NextResponse.json({ success: false, error: "provider_not_configured" }, { status: 503 });
  }
  if (bearerToken(request) !== expected) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const provider = await ensureFocoOsManualProvider();
    if (!provider.ready) {
      return NextResponse.json({ success: false, error: provider.reason || "provider_not_ready", provider }, { status: 503 });
    }

    // Sync interativo: os eventos vêm em ordem decrescente, então 100 cobre os
    // eventos recentes sem varrer centenas de usuários/consultas a cada refresh.
    const automations = await processBehaviorMarketingAutomations({ limit: 100 });

    // Foco OS apenas recebe cards para envio humano. Escoa os jobs elegíveis já
    // preparados, preservando scheduled_at e cancelamento por conversão.
    const queue = await processCommunicationQueue(20);

    return NextResponse.json({ success: true, provider, automations, queue });
  } catch (error) {
    console.error("[foco-os-sync] falha ao sincronizar Central Harmomus", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "sync_failed",
    }, { status: 500 });
  }
}
