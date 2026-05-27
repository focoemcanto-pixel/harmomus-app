import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWebhookEventLabel, type WebhookEvent } from "@/types/webhooks";

export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString("hex")}`;
}

export function signWebhookPayload(payload: string, secret: string, timestamp: number) {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function normalizeTestPhone(value: string) {
  return value.replace(/[\s()\-*]/g, "").replace(/\D/g, "");
}

export function buildFakePayload(event: WebhookEvent, testPhone: string) {
  return {
    event,
    event_label: getWebhookEventLabel(event),
    test: true,
    delivery_id: `evt_test_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
    phone: testPhone,
    number: testPhone,
    to: testPhone,
    message: "Teste de webhook enviado pelo Harmomus.",
    text: "Teste de webhook enviado pelo Harmomus.",
    recipient: {
      name: "Cliente Teste",
      email: "cliente.teste@harmomus.com",
      phone: testPhone,
      whatsapp: testPhone,
    },
    customer: {
      name: "Cliente Teste",
      email: "cliente.teste@harmomus.com",
      phone: testPhone,
      whatsapp: testPhone,
    },
    data: {
      id: `test_order_${crypto.randomUUID()}`,
      plan: "Premium",
      amount: 3990,
      currency: "BRL",
      status: event.includes("failed") ? "failed" : "approved",
    },
  };
}

export async function saveWebhookLog(input: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();
  await admin.from("webhook_logs").insert(input);
}
