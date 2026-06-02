import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();
  if (!context.isAdmin) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const body = (await request.json()) as {
    channel: "whatsapp" | "email";
    target: string;
    content: string;
    provider?: string;
  };

  const supabase = createSupabaseAdminClient() as any;
  const payload = {
    ok: true,
    simulated: true,
    channel: body.channel,
    target: body.target,
    note: "Nenhum provider real de comunicação está configurado. Teste registrado como simulação.",
  };

  const { error } = await supabase.from("communication_logs").insert({
    channel: body.channel,
    event: "communication.test.simulated",
    level: "info",
    message: "Teste de comunicação registrado como simulação.",
    payload: { ...body, provider: body.provider ?? "simulation" },
    response: payload,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(payload);
}
