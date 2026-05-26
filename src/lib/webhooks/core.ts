import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WebhookEvent } from "@/types/webhooks";

export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

export function signWebhookPayload(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function buildFakePayload(event: WebhookEvent) {
  return {
    id: `evt_${crypto.randomUUID()}`,
    event,
    created_at: new Date().toISOString(),
    mode: "live",
    source: "harmomus",
    data: {
      member: { id: "mem_123", email: "member@harmomus.com", name: "Membro Harmomus" },
      subscription: { id: "sub_123", status: "active", plan: "premium" },
      payment: { id: "pay_123", amount: 3900, currency: "BRL", status: event === "payment.failed" ? "failed" : "paid" },
      campaign: { id: "camp_123", name: "Launch Week", applied: event === "promotion.applied" },
    },
  };
}

export async function saveWebhookLog(input: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();
  await admin.from("webhook_logs").insert(input);
}
