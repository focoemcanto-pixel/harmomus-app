import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createPortal } from "@/lib/data/billing";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Não foi possível abrir o portal da assinatura agora.";
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(new URL("/login?redirect=%2Fassinatura", req.url), { status: 303 });

    const portal = await createPortal(user.id, user.email, new URL(req.url).origin);
    return NextResponse.redirect(portal.url, { status: 303 });
  } catch (error) {
    const redirect = new URL("/assinatura", req.url);
    redirect.searchParams.set("error", toErrorMessage(error));
    return NextResponse.redirect(redirect, { status: 303 });
  }
}
