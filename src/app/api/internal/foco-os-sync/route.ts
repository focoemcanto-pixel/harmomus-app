import { NextResponse } from "next/server";

import { ensureFocoOsManualProvider } from "@/lib/communication/foco-os-provider";
import { getFocoOsCommunicationToken } from "@/lib/communication/foco-os-token";
import { processCommunicationQueue } from "@/lib/communication/marketing-queue";
import { processBehaviorMarketingAutomations } from "@/lib/communication/automation-engine-v2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearerToken(request: Request) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

export async function POST(request: Request) {
  const expected = await getFocoOsCommunicationToken();
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

    const automations = await processBehaviorMarketingAutomations({ limit: 100 });
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
