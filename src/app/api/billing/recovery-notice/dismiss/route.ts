import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { dismissBillingRecoveryNotice } from "@/lib/data/billing-recovery-notices";

function appUrl(path: string, req: Request) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || req.url);
}

export async function POST(req: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) {
      return NextResponse.redirect(appUrl("/login?redirect=%2Fassinatura", req), 303);
    }

    await dismissBillingRecoveryNotice(context.profile.id);
    return NextResponse.redirect(appUrl("/?message=Aviso de cobrança dispensado", req), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível dispensar o aviso agora.";
    return NextResponse.redirect(appUrl(`/assinatura?error=${encodeURIComponent(message)}`, req), 303);
  }
}
