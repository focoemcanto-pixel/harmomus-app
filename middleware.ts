import { NextRequest, NextResponse } from "next/server";

const AUDIO_ROUTE_PATTERN = /^\/api\/audio\/([^/]+)$/;

export function middleware(request: NextRequest) {
  const match = request.nextUrl.pathname.match(AUDIO_ROUTE_PATTERN);
  if (!match?.[1]) return NextResponse.next();

  if (request.nextUrl.searchParams.get("proxy") === "1") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = `/api/audio/${match[1]}/signed`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/api/audio/:id"],
};
