import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WebhookEvent } from "@/types/webhooks";

export type QueueWebhookInput = {
  event: WebhookEvent;
  source?: string;
  mode?: "live" | "test";
  recipient?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  data?: Record<string, unknown>;
};

export async function enqueueWebhookDispatch(input: QueueWebhookInput) {
  try {
    const admin = createSupabaseAdminClient() as any;

    const { data, error } = await admin
      .from("webhook_dispatch_queue")
      .insert({
        event: input.event,
        source: input.source ?? "harmomus",
        mode: input.mode ?? "live",
        recipient: input.recipient ?? {},
        data: input.data ?? {},
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[webhooks] Failed to enqueue webhook", {
        event: input.event,
        error,
      });

      return null;
    }

    return data?.id ?? null;
  } catch (error) {
    console.error("[webhooks] Queue enqueue failed", error);
    return null;
  }
}
