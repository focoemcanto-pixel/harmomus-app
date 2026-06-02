import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { resolveWebhookRecipientForUser } from "@/lib/webhooks/recipient";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhooks";

const BILLING_EVENTS = new Set<WebhookEvent>([
  "plan.plus_activated",
  "plan.premium_activated",
  "upgrade.free_to_plus",
  "upgrade.free_to_premium",
  "upgrade.plus_to_premium",
  "subscription.canceled",
  "subscription.payment_failed",
]);

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

function clean(value: unknown) {
  return String(value ?? "").trim() || null;
}

function pickAttribution(body: any) {
  const attribution: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = clean(body?.[key] ?? body?.metadata?.[key] ?? body?.attribution?.[key]);
    if (value) attribution[key] = value.slice(0, 500);
  }
  return attribution;
}

function inferPlanFromEvent(event: WebhookEvent, currentPlan?: string | null) {
  if (event.includes("premium")) return "premium";
  if (event.includes("plus")) return "plus";
  if (event === "subscription.canceled" || event === "subscription.payment_failed") return currentPlan ?? null;
  return currentPlan ?? null;
}

function inferPreviousPlanFromEvent(event: WebhookEvent, currentPrevious?: string | null) {
  if (event === "upgrade.free_to_plus" || event === "upgrade.free_to_premium") return "free";
  if (event === "upgrade.plus_to_premium") return "plus";
  return currentPrevious ?? null;
}

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const userId = clean(body?.user_id);
  const selectedEvent = clean(body?.event) as WebhookEvent | null;

  if (!userId) return NextResponse.json({ error: "Informe user_id." }, { status: 400 });
  if (!selectedEvent || !WEBHOOK_EVENTS.includes(selectedEvent) || !BILLING_EVENTS.has(selectedEvent)) {
    return NextResponse.json({ error: "Evento de cobrança inválido para simulação." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: subscription, error: subscriptionError } = await admin
    .from("subscriptions")
    .select("id,status,stripe_customer_id,gateway_customer_id,stripe_subscription_id,gateway_subscription_id,stripe_price_id,current_period_end,trial_ends_at,plans(slug)")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) return NextResponse.json({ error: subscriptionError.message }, { status: 500 });

  const attribution = pickAttribution(body);
  let attributionUpdate: Record<string, unknown> | null = null;

  if (subscription?.id && Object.keys(attribution).length) {
    attributionUpdate = { ...attribution, updated_at: new Date().toISOString() };
    const { error: attributionError } = await admin
      .from("subscriptions")
      .update(attributionUpdate)
      .eq("id", subscription.id);

    if (attributionError) return NextResponse.json({ error: attributionError.message }, { status: 500 });
  }

  const currentPlan = subscription?.plans?.slug ?? null;
  const recipient = await resolveWebhookRecipientForUser(admin, userId, { metadata: body?.metadata ?? {} });
  const stripeEventId = `evt_sim_${crypto.randomUUID()}`;
  const simulatedAt = new Date().toISOString();
  const plan = clean(body?.plan) ?? inferPlanFromEvent(selectedEvent, currentPlan);
  const previousPlan = clean(body?.previous_plan) ?? inferPreviousPlanFromEvent(selectedEvent, null);
  const missingPhoneDiagnostic = recipient.phone ? null : "missing_phone_for_paid_webhook";

  const data = {
    stripe_event_id: stripeEventId,
    stripe_event_type: "admin.simulated_billing_event",
    user_id: userId,
    plan,
    previous_plan: previousPlan,
    status: selectedEvent === "subscription.canceled" ? "canceled" : selectedEvent === "subscription.payment_failed" ? "payment_failed" : "active",
    stripe_customer_id: clean(body?.stripe_customer_id) ?? subscription?.stripe_customer_id ?? subscription?.gateway_customer_id ?? null,
    stripe_subscription_id: clean(body?.stripe_subscription_id) ?? subscription?.stripe_subscription_id ?? subscription?.gateway_subscription_id ?? null,
    stripe_price_id: subscription?.stripe_price_id ?? null,
    current_period_end: subscription?.current_period_end ?? null,
    trial_ends_at: subscription?.trial_ends_at ?? null,
    email: recipient.email,
    phone: recipient.phone,
    phone_source: recipient.phone_source,
    diagnostic: missingPhoneDiagnostic,
    attribution,
    attribution_updated: Boolean(attributionUpdate),
    simulated: true,
    simulated_by: current.profile?.id ?? null,
    simulated_at: simulatedAt,
  };

  const result = await dispatchWebhookEvent({
    event: selectedEvent,
    source: "admin.simulate_billing_event",
    mode: "test",
    recipient,
    data,
  });

  return NextResponse.json({ ok: true, event: selectedEvent, recipient, data, result });
}
