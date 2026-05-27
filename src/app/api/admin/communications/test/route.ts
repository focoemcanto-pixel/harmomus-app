import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { channel: "whatsapp" | "email"; target: string; content: string; provider?: string };
  const supabase = await createClient();

  const payload = { ok: true, simulated: true, channel: body.channel, target: body.target };
  const { error } = await supabase.from("communication_logs" as never).insert({
    channel: body.channel,
    provider: body.provider ?? "test",
    status: "success",
    payload: body,
    response_payload: payload,
    error_message: null,
  } as never);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(payload);
}
