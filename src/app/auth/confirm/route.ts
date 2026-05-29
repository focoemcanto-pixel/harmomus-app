import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const currentUrl = new URL(request.url);
  const callbackUrl = new URL("/auth/confirm/callback", currentUrl.origin);

  currentUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value);
  });

  return NextResponse.redirect(callbackUrl, 307);
}
