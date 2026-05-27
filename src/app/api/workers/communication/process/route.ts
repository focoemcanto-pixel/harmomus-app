import { NextResponse } from "next/server";
import { getPendingQueue } from "@/lib/communication/service";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const items = await getPendingQueue(50);
  let processed = 0;

  for (const item of items) {
    processed += 1;
    const ok = item.attempts < 2;
    const status = ok ? "sent" : "failed";
    await supabase.from("communication_queue" as never).update({ status, attempts: item.attempts + 1 } as never).eq("id", item.id);
    await supabase.from("communication_deliveries" as never).update({ status } as never).eq("id", item.delivery_id);
    await supabase.from("communication_logs" as never).insert({
      campaign_id: item.campaign_id,
      channel: item.channel,
      provider: "worker",
      status,
      payload: item.payload,
      response_payload: { processedAt: new Date().toISOString() },
      error_message: ok ? null : "Max retry reached",
    } as never);
  }

  return NextResponse.json({ processed });
}
