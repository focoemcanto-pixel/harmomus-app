import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { mapStripeStatus } from "@/lib/stripe/status";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: any } };

type SyncedSubscriptionContext = {
  userId: string;
  planSlug: string | null;
  status: string;
  customerId: string | null;
  subscriptionId: string | null;
  stripePriceId: string | null;
  customerEmail: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
} | null;

function verifySignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const digestBuffer = Buffer.from(digest, "hex");
  const signatureBuffer = Buffer.from(parts.v1, "hex");

  return digestBuffer.length === signatureBuffer.length && timingSafeEqual(digestBuffer, signatureBuffer);
}

function getPlanSlugFromEnvPrice(stripePriceId: string | null) {
  if (!stripePriceId) return null;
  if (stripePriceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (stripePriceId === process.env.STRIPE_PREMIUM_PRICE_ID) return "premium";
  return null;
}

async function getPlanByStripePriceId(supabase: any, stripePriceId: string | null) {
  if (!stripePriceId) return null;

  const { data } = await supabase.from("plans").select("id, slug").eq("stripe_price_id", stripePriceId).maybeSingle();
  if (data?.id) return data;

  const fallbackSlug = getPlanSlugFromEnvPrice(stripePriceId);
  if (!fallbackSlug) return null;

  const { data: fallbackPlan } = await supabase.from("plans").select("id, slug").eq("slug", fallbackSlug).maybeSingle();
  return fallbackPlan ?? null;
}

async function ensureUserIdByCustomerOrEmail(supabase: any, customerId: string | null, email: string | null) {
  if (customerId) {
    const { data: byCustomer } = await supabase.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
    if (byCustomer?.user_id) return byCustomer.user_id as string;
  }

  if (!email) return null;
  const { data: byEmail } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
  return byEmail?.id ?? null;
}

async function getProfileForWebhook(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("id,full_name,email,phone").eq("id", userId).maybeSingle();
  return data ?? null;
}

async function downgradeToFree(supabase: any, userId: string, patch: Record<string, unknown>) {
  const { data: freePlan } = await supabase.from("plans").select("id").eq("slug", "free").single();
  if (!freePlan?.id) return;
  await supabase.from("subscriptions").upsert({ user_id: userId, plan_id: freePlan.id, ...patch }, { onConflict: "user_id" });
}

function mapStripeEventToWebhookEvent(eventType: string, status: string) {
  if (eventType === "checkout.session.completed") return "checkout.completed";
  if (eventType === "customer.subscription.created") return "subscription.created";
  if (eventType === "customer.subscription.deleted") return "subscription.canceled";
  if (eventType === "invoice.paid") return "payment.approved";
  if (eventType === "invoice.payment_failed") return "subscription.payment_failed";
  if (eventType === "customer.subscription.updated" && status === "active") return "subscription.renewed";
  return null;
}

async function syncSubscriptionFromStripeEvent(supabase: any, event: StripeEvent): Promise<SyncedSubscriptionContext> {
  const object = event.data?.object ?? {};

  const customerId = object.customer ?? null;
  const subscriptionId = object.subscription ?? (String(object.id ?? "").startsWith("sub_") ? object.id : null);
  const stripePriceId =
    object.items?.data?.[0]?.price?.id ?? object.lines?.data?.[0]?.price?.id ?? object.plan?.id ?? object.price?.id ?? null;
  const customerEmail = object.customer_details?.email ?? object.customer_email ?? object.email ?? null;

  const userId = await ensureUserIdByCustomerOrEmail(supabase, customerId, customerEmail);
  if (!userId) return null;

  const status = mapStripeStatus(object.status ?? (event.type === "invoice.payment_failed" ? "past_due" : "active"));
  const currentPeriodEnd = object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null;
  const trialEndsAt = object.trial_end ? new Date(object.trial_end * 1000).toISOString() : null;

  if (event.type === "customer.subscription.deleted") {
    await downgradeToFree(supabase, userId, {
      status: "canceled",
      gateway: "stripe",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: stripePriceId,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      next_billing_at: null,
      canceled_at: new Date().toISOString(),
      last_webhook_event: event.type,
      updated_at: new Date().toISOString(),
    });

    return {
      userId,
      planSlug: "free",
      status: "canceled",
      customerId,
      subscriptionId,
      stripePriceId,
      customerEmail,
      currentPeriodEnd,
      trialEndsAt,
    };
  }

  const plan = await getPlanByStripePriceId(supabase, stripePriceId);
  if (!plan?.id) return null;

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      plan_id: plan.id,
      status,
      gateway: "stripe",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: stripePriceId,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      next_billing_at: currentPeriodEnd,
      last_webhook_event: event.type,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return {
    userId,
    planSlug: plan.slug ?? null,
    status,
    customerId,
    subscriptionId,
    stripePriceId,
    customerEmail,
    currentPeriodEnd,
    trialEndsAt,
  };
}

async function dispatchStripeWebhookEvent(supabase: any, event: StripeEvent, context: SyncedSubscriptionContext) {
  if (!context) return;

  const webhookEvent = mapStripeEventToWebhookEvent(event.type, context.status);
  if (!webhookEvent) return;

  const profile = await getProfileForWebhook(supabase, context.userId);

  await dispatchWebhookEvent({
    event: webhookEvent as any,
    source: "stripe",
    recipient: {
      name: profile?.full_name ?? null,
      email: profile?.email ?? context.customerEmail,
      phone: profile?.phone ?? null,
    },
    data: {
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      user_id: context.userId,
      plan: context.planSlug,
      status: context.status,
      stripe_customer_id: context.customerId,
      stripe_subscription_id: context.subscriptionId,
      stripe_price_id: context.stripePriceId,
      current_period_end: context.currentPeriodEnd,
      trial_ends_at: context.trialEndsAt,
    },
  });
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const payload = await req.text();
  if (!verifySignature(payload, signature, secret)) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  const event = JSON.parse(payload) as StripeEvent;
  const acceptedEvents = new Set([
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]);

  const supabase = (await createClient()) as any;
  await supabase.from("billing_events").insert({ provider: "stripe", event_type: event.type, payload: event, processed: false });

  if (acceptedEvents.has(event.type)) {
    const context = await syncSubscriptionFromStripeEvent(supabase, event);
    await dispatchStripeWebhookEvent(supabase, event, context);
  }

  await supabase
    .from("billing_events")
    .update({ processed: true })
    .eq("provider", "stripe")
    .eq("event_type", event.type)
    .eq("payload->>id", event.id);

  return NextResponse.json({ received: true });
}
