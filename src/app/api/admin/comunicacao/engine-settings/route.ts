import { NextResponse } from "next/server";

import { getMarketingEngineSettings, updateMarketingEngineSettings } from "@/lib/communication/engine-settings";
import { requireAdmin, sanitizeText } from "../_lib/marketing-api";

export async function GET() {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const { data, error, missingTable } = await getMarketingEngineSettings(admin as any);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, missingTable });
}

export async function POST(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const action = sanitizeText(body?.action);
  const productionEnabled = action === "start" ? true : action === "pause" ? false : Boolean(body?.production_enabled);
  const pausedReason = productionEnabled ? null : sanitizeText(body?.paused_reason) || "Produção pausada pelo admin.";

  const { data, error } = await updateMarketingEngineSettings(
    {
      production_enabled: productionEnabled,
      paused_reason: pausedReason,
    },
    admin as any,
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
