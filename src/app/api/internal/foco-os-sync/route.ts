import { NextResponse } from "next/server";

import { ensureFocoOsManualProvider } from "@/lib/communication/foco-os-provider";
import { processCommunicationQueue } from "@/lib/communication/marketing-queue";

export const dynamic = "force-dynamic";

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

    // O processador original do Harmomus continua sendo a fonte da verdade:
    // valida conversão, scheduled_at, telefone, mensagem e regras antes do handoff.
    const result = await processCommunicationQueue(1);
    return NextResponse.json({ success: true, provider, result });
  } catch (error) {
    console.error("[foco-os-sync] falha ao processar fila Harmomus", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "sync_failed",
    }, { status: 500 });
  }
}
