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
  let digits = value.replace(/[\s()\-*]/g, "").replace(/\D/g, "");

  while (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("550")) digits = `55${digits.slice(3)}`;
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);

  const alreadyHasBrazilCode = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  if (alreadyHasBrazilCode) return digits;

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

function mapToKiwifyEvent(event: WebhookEvent) {
  if (event.includes("abandoned")) return "cart_abandoned";
  if (event.includes("canceled") || event.includes("cancelled")) return "subscription_canceled";
  if (event.includes("failed")) return "payment_refused";
  if (event.includes("refunded")) return "refund";
  if (event.includes("chargeback")) return "chargeback";
  if (event.includes("checkout") || event.includes("payment") || event.includes("subscription") || event.includes("plan")) return "order_approved";
  return "order_approved";
}

export function buildFakePayload(event: WebhookEvent, testPhone: string) {
  const phoneDigits = normalizeTestPhone(testPhone);
  const phoneDisplay = formatBrazilPhone(phoneDigits);
  const phoneWithoutCountry = phoneDigits.startsWith("55") ? phoneDigits.slice(2) : phoneDigits;
  const eventLabel = getWebhookEventLabel(event);
  const customerName = "Cliente Teste";
  const customerEmail = "cliente.teste@harmomus.com";
  const testMessage = `Teste Harmomus recebido: ${eventLabel}.`;
  const now = new Date().toISOString();
  const orderId = `hm_test_${crypto.randomUUID()}`;
  const kiwifyEvent = mapToKiwifyEvent(event);

  return {
    // Formato principal inspirado em webhooks de checkout como Kiwify.
    event: kiwifyEvent,
    webhook_event_type: kiwifyEvent,
    event_type: kiwifyEvent,
    status: kiwifyEvent === "order_approved" ? "approved" : kiwifyEvent,
    order_status: kiwifyEvent === "order_approved" ? "approved" : kiwifyEvent,
    approved: kiwifyEvent === "order_approved",
    test: true,
    source: "harmomus",
    delivery_id: `evt_test_${crypto.randomUUID()}`,
    created_at: now,

    // Evento interno do Harmomus para segmentação avançada.
    harmomus_event: event,
    harmomus_event_label: eventLabel,
    event_label: eventLabel,

    order_id: orderId,
    transaction_id: orderId,
    subscription_id: `sub_test_${crypto.randomUUID()}`,
    payment_method: "credit_card",
    currency: "BRL",
    total_price: 39.9,
    amount: 3990,
    product: {
      id: "harmomus-premium-test",
      name: "Harmomus Premium",
      type: "subscription",
    },
    product_name: "Harmomus Premium",
    plan: "Premium",
    plan_name: "Premium",

    Customer: {
      full_name: customerName,
      first_name: "Cliente",
      email: customerEmail,
      mobile: phoneDigits,
      phone_number: phoneDigits,
      phone: phoneDigits,
      whatsapp: phoneDigits,
    },
    customer: {
      name: customerName,
      full_name: customerName,
      first_name: "Cliente",
      email: customerEmail,
      phone: phoneDigits,
      phone_number: phoneDigits,
      mobile: phoneDigits,
      whatsapp: phoneDigits,
      telefone: phoneDisplay,
      Telefone: phoneDisplay,
    },
    buyer: {
      name: customerName,
      full_name: customerName,
      email: customerEmail,
      phone: phoneDigits,
      phone_number: phoneDigits,
      mobile: phoneDigits,
      whatsapp: phoneDigits,
    },

    // Campos diretos — usados por automações tipo LabMessage/Make/Zapier.
    name: customerName,
    full_name: customerName,
    first_name: "Cliente",
    email: customerEmail,
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

    labmessage: {
      phone: phoneDigits,
      number: phoneDigits,
      to: phoneDigits,
      message: testMessage,
      name: customerName,
      email: customerEmail,
    },
    variables: {
      nome: customerName,
      name: customerName,
      email: customerEmail,
      telefone: phoneDigits,
      phone: phoneDigits,
      whatsapp: phoneDigits,
      mensagem: testMessage,
      evento: kiwifyEvent,
      evento_harmomus: event,
      evento_nome: eventLabel,
      produto: "Harmomus Premium",
      plano: "Premium",
    },

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
      id: orderId,
      order_id: orderId,
      transaction_id: orderId,
      event: kiwifyEvent,
      harmomus_event: event,
      product_name: "Harmomus Premium",
      plan: "Premium",
      amount: 3990,
      total_price: 39.9,
      currency: "BRL",
      status: kiwifyEvent === "order_approved" ? "approved" : kiwifyEvent,
      customer: {
        name: customerName,
        full_name: customerName,
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
