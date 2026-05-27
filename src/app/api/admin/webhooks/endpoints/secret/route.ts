import { NextResponse } from "next/server";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { generateWebhookSecret } from "@/lib/webhooks/core";

export async function POST() {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  return NextResponse.json({ secret: generateWebhookSecret() });
}
