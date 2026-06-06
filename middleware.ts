import { NextRequest, NextResponse } from "next/server";

const AUDIO_ROUTE_PATTERN = /^\/api\/audio\/([^/]+)$/;
const RESERVED_AUDIO_ROUTE_IDS = new Set(["analyze", "generate", "status"]);

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(AUDIO_ROUTE_PATTERN);
  const id = match?.[1];
  if (!id) return NextResponse.next();

  if (RESERVED_AUDIO_ROUTE_IDS.has(id)) {
    return NextResponse.next();
  }

  if (request.nextUrl.searchParams.get("proxy") === "1") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/api/audio/${id}/signed`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/api/audio/:id"],
};
