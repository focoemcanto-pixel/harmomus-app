import { NextResponse } from "next/server";

import { requireAdmin } from "../_lib/marketing-api";

function getPublicBaseUrl(request: Request) {
  const envBase = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envBase) return envBase.replace(/\/$/, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (response) return response;

  const baseUrl = getPublicBaseUrl(request);
  const { data, error } = await admin
    .from("kits")
    .select("id,name,slug,artist,cover_url,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: (data ?? []).map((kit) => ({
      ...kit,
      url: `${baseUrl}/biblioteca/${kit.slug}`,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
