import { NextResponse } from "next/server";

import { resolveCampaignAudience } from "@/lib/communication/campaign-audience";
import { requireAdmin, sanitizeStringArray } from "../_lib/marketing-api";

const PLANS = new Set(["free", "plus", "premium", "ministry"]);

function asBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "1", "yes", "sim"].includes(value.toLowerCase())) return true;
    if (["false", "0", "no", "nao", "não"].includes(value.toLowerCase())) return false;
  }
  return fallback;
}

export async function POST(request: Request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  const plans = sanitizeStringArray(body?.plans, PLANS);

  try {
    const result = await resolveCampaignAudience({
      plans,
      includeCurrent: asBoolean(body?.includeCurrent ?? body?.include_current),
      includeLegacy: asBoolean(body?.includeLegacy ?? body?.include_legacy),
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao calcular audiência da campanha.",
      },
      { status: 500 },
    );
  }
}
