import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

export const runtime = "nodejs";

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

  const admin = createSupabaseAdminClient() as any;

  const { data: queueItems, error } = await admin
    .from("webhook_dispatch_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  if (!queueItems?.length) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  let processed = 0;

  for (const item of queueItems) {
    try {
      await admin
        .from("webhook_dispatch_queue")
        .update({
          status: "processing",
          attempts: Number(item.attempts ?? 0) + 1,
        })
        .eq("id", item.id);

      const result = await dispatchWebhookEvent({
        event: item.event,
        source: item.source,
        mode: item.mode,
        recipient: item.recipient,
        data: item.data,
      });

      await admin
        .from("webhook_dispatch_queue")
        .update({
          status: "completed",
          processed_at: new Date().toISOString(),
          result,
        })
        .eq("id", item.id);

      processed += 1;
    } catch (error) {
      const attempts = Number(item.attempts ?? 0) + 1;
      const maxAttempts = Number(item.max_attempts ?? 5);

      await admin
        .from("webhook_dispatch_queue")
        .update({
          status: attempts >= maxAttempts ? "failed" : "pending",
          attempts,
          last_error: error instanceof Error ? error.message : "Falha desconhecida",
          scheduled_for:
            attempts >= maxAttempts
              ? item.scheduled_for
              : new Date(Date.now() + attempts * 60000).toISOString(),
        })
        .eq("id", item.id);

      console.error("[webhooks-worker] Failed to process queue item", {
        queueId: item.id,
        error,
      });
    }
  }

  return NextResponse.json({
    success: true,
    processed,
  });
}
