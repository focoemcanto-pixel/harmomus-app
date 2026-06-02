import { NextResponse } from "next/server";

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || "884121333815374";
const ALLOWED_EVENTS = new Set(["Lead", "Lead_free_signup", "CompleteRegistration", "CompleteRegistration_first_login"]);

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 500) : "";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.eventName);
    if (!PIXEL_ID || !ALLOWED_EVENTS.has(eventName)) {
      return NextResponse.json({ ok: false, error: "Evento inválido." }, { status: 400 });
    }

    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
    const params = new URLSearchParams();
    params.set("id", PIXEL_ID);
    params.set("ev", eventName);
    params.set("dl", clean(body.url) || request.headers.get("referer") || "https://harmomus.com");
    params.set("rl", request.headers.get("referer") || "");
    params.set("if", "false");
    params.set("ts", String(Date.now()));

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      const normalized = clean(value);
      if (normalized) params.set(`cd[${key}]`, normalized);
    }

    const endpoint = `https://www.facebook.com/tr/?${params.toString()}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "user-agent": request.headers.get("user-agent") || "Harmomus Meta Fallback",
        "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    return NextResponse.json({ ok: response.ok, status: response.status, eventName });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Falha ao enviar evento." }, { status: 500 });
  }
}
