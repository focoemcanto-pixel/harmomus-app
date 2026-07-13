import { NextResponse } from "next/server";

import { processBehaviorMarketingAutomations } from "@/lib/communication/automation-engine-v2";
import { requireAdmin } from "../../_lib/marketing-api";

export const runtime = "nodejs";

function parseBoolean(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function parseLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(1, Math.min(Math.floor(parsed), 5000));
}

export async function GET(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const url = new URL(request.url);
  const dryRun = parseBoolean(url.searchParams.get("dryRun"));
  const limit = parseLimit(url.searchParams.get("limit"));

  try {
    const result = await processBehaviorMarketingAutomations({ dryRun, limit });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar automações.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => ({}));
  const dryRun = Boolean(body?.dryRun);
  const limit = parseLimit(body?.limit);

  try {
    const result = await processBehaviorMarketingAutomations({ dryRun, limit });
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar automações.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
