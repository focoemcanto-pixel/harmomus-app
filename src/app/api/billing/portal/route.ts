import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createPortal } from "@/lib/data/billing";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível abrir o portal da assinatura agora.";
}

export async function POST(req: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    const profile = context.profile;
    if (context.isGuest || !profile?.id) return NextResponse.redirect(new URL("/login?redirect=%2Fassinatura", req.url), { status: 303 });

    const email = profile.email?.trim();
    if (!email) throw new Error("Seu perfil não possui e-mail vinculado para abrir o portal Stripe.");

    const portal = await createPortal(profile.id, email, new URL(req.url).origin);
    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (error) {
    const redirect = new URL("/assinatura", req.url);
    redirect.searchParams.set("error", toErrorMessage(error));
    return NextResponse.redirect(redirect, { status: 303 });
  }
}
