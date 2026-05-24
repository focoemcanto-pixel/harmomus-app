import { NextResponse } from "next/server";

import { getAdminSettings } from "@/lib/data/admin-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAdminSettings();
  const faviconUrl = settings.branding.faviconUrl || settings.branding.logoUrl;

  if (faviconUrl) {
    return NextResponse.redirect(faviconUrl);
  }

  return new NextResponse("", {
    status: 204,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
