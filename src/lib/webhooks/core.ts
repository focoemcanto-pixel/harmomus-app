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
  const digits = value.replace(/[\s()\-*]/g, "").replace(/\D/g, "");

  // Permite que o admin digite 71999999999 ou 5571999999999.
  // Para o LabMessage, o teste sempre sai padronizado com DDI 55.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatBrazilPhone(value: string) {
  const digits = normalizeTestPhone(value);
  const withoutCountry = digits.startsWith("55") ? digits.slice(2) : digits;
  const ddd = withoutCountry.slice(0, 2);
  const first = withoutCountry.length >= 11 ? withoutCountry.slice(2, 7) : withoutCountry.slice(2, 6);
  const last = withoutCountry.length >= 11 ? withoutCountry.slice(7, 11) : withoutCountry.slice(6, 10);

  if (!ddd || !first || !last) return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
  return `+55 (${ddd}) ${first}-${last}`;
}

export function buildFakePayload(event: WebhookEvent, testPhone: string) {
  const phoneDigits = normalizeTestPhone(testPhone);
  const phoneDisplay = formatBrazilPhone(phoneDigits);
  const phoneWithoutCountry = phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits;
  const eventLabel = getWebhookEventLabel(event);
  const customerName = "Cliente Teste";
  const customerEmail = "cliente.teste@harmomus.com";
  const testMessage = `Teste Harmomus recebido: ${eventLabel}.`;

  return {
    event,
    event_label: eventLabel,
    test: true,
    delivery_id: `evt_test_${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),

    // Campos diretos — usados por automações tipo LabMessage/Make/Zapier.
    phone: phoneDigits,
    number: phoneDigits,
    to: phoneDigits,
    whatsapp: phoneDigits,
    mobile: phoneDigits,
    phone_number: phoneDigits,
    whatsapp_number: phoneDigits,
    recipient_phone: phoneDigits,
    contact_phone: phoneDigits,
    destination: phoneDigits,
    numero: phoneDigits,
    número: phoneDigits,
    celular_numero: phoneDigits,
    numero_whatsapp: phoneDigits,
    telefone_com_ddd: phoneWithoutCountry,
    celular_com_ddd: phoneWithoutCountry,

    // Aliases em PT-BR usados por plataformas como LabMessage.
    Nome: customerName,
    nome: customerName,
    Email: customerEmail,
    email: customerEmail,
    Telefone: phoneDisplay,
    telefone: phoneDisplay,
    Celular: phoneDisplay,
    celular: phoneDisplay,
    WhatsApp: phoneDisplay,

    message: testMessage,
    text: testMessage,
    body: testMessage,
    Mensagem: testMessage,
    mensagem: testMessage,

    recipient: {
      name: customerName,
      email: customerEmail,
      phone: phoneDigits,
      number: phoneDigits,
      whatsapp: phoneDigits,
      mobile: phoneDigits,
      phone_number: phoneDigits,
      whatsapp_number: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    customer: {
      name: customerName,
      email: customerEmail,
      phone: phoneDigits,
      number: phoneDigits,
      whatsapp: phoneDigits,
      mobile: phoneDigits,
      phone_number: phoneDigits,
      whatsapp_number: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    contact: {
      name: customerName,
      email: customerEmail,
      phone: phoneDigits,
      number: phoneDigits,
      whatsapp: phoneDigits,
      mobile: phoneDigits,
      phone_number: phoneDigits,
      whatsapp_number: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    contato: {
      nome: customerName,
      email: customerEmail,
      telefone: phoneDisplay,
      celular: phoneDisplay,
      whatsapp: phoneDisplay,
      numero: phoneDigits,
      celular_numero: phoneDigits,
    },
    data: {
      id: `test_order_${crypto.randomUUID()}`,
      plan: "Premium",
      amount: 3990,
      currency: "BRL",
      status: event.includes("failed") ? "failed" : "approved",
      customer: {
        name: customerName,
        email: customerEmail,
        phone: phoneDigits,
        number: phoneDigits,
        whatsapp: phoneDigits,
        telefone: phoneDisplay,
      },
    },
  };
}

export async function saveWebhookLog(input: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();
  await admin.from("webhook_logs").insert(input);
}
