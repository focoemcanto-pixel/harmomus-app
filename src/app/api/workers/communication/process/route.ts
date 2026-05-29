import { NextResponse } from "next/server";

import { getPendingQueue } from "@/lib/communication/service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function validateWorkerToken(request: Request) {
  const expectedToken = process.env.HARMOMUS_WORKER_TOKEN;
  const receivedToken = request.headers.get("x-harmomus-worker-token");

  if (!expectedToken) {
    return NextResponse.json({ success: false, error: "Worker token não configurado." }, { status: 503 });
  }

  if (!receivedToken || receivedToken !== expectedToken) {
    return NextResponse.json({ success: false, error: "Não autorizado." }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  const authError = validateWorkerToken(request);
  if (authError) return authError;

  const supabase = createSupabaseAdminClient() as any;
  const items = await getPendingQueue(50);

  if (!items.length) {
    return NextResponse.json({ success: true, processed: 0, skipped: 0 });
  }

  let skipped = 0;

  for (const item of items) {
    skipped += 1;

    await supabase
      .from("communication_logs")
      .update({
        status: "queued",
        details: {
          ...(item.payload ?? {}),
          worker_checked_at: new Date().toISOString(),
          worker_note: "Nenhum provider real de comunicação está configurado. Mensagem mantida em fila.",
        },
      })
      .eq("id", item.id);
  }

  return NextResponse.json({
    success: true,
    processed: 0,
    skipped,
    reason: "communication_provider_not_configured",
  });
}
