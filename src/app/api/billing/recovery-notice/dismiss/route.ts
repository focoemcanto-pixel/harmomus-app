import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { dismissBillingRecoveryNotice } from "@/lib/data/billing-recovery-notices";
import { trustedAppUrl } from "@/lib/security/trusted-app-url";

function isSameOriginNavigation(req: Request) {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) return false;

  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === trustedAppUrl("/", req).origin;
  } catch {
    return false;
  }
}

async function dismiss(req: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) {
      return NextResponse.redirect(trustedAppUrl("/login?redirect=%2Fassinatura", req), 303);
    }

    await dismissBillingRecoveryNotice(context.profile.id);
    return NextResponse.redirect(trustedAppUrl("/?message=Aviso de cobrança dispensado", req), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível dispensar o aviso agora.";
    return NextResponse.redirect(trustedAppUrl(`/assinatura?error=${encodeURIComponent(message)}`, req), 303);
  }
}

export async function GET(req: Request) {
  if (!isSameOriginNavigation(req)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  return dismiss(req);
}

export async function POST(req: Request) {
  if (!isSameOriginNavigation(req)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  return dismiss(req);
}
