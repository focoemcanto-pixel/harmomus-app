import { NextResponse } from "next/server";

import { getCurrentProfile } from "@/lib/auth/current-user";

function hasValidPhone(value?: string | null) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return false;
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return normalized.length === 12 || normalized.length === 13;
}

export async function GET() {
  const profile = await getCurrentProfile();

  if (!profile?.id) {
    return NextResponse.json({ authenticated: false, requiresPhoneUpdate: false });
  }

  return NextResponse.json({
    authenticated: true,
    requiresPhoneUpdate: !hasValidPhone((profile as any).phone),
  });
}
