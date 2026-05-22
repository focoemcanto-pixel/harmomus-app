import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { mapStripeStatus } from "@/lib/stripe/status";

export const runtime = "nodejs";

type StripeEvent = { id: string; type: string; data?: { object?: any } };

function verifySignature(payload: string, signature: string, secret: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.split("=")));
  if (!parts.t || !parts.v1) return false;

  const signedPayload = `${parts.t}.${payload}`;
  const digest = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  const digestBuffer = Buffer.from(digest, "hex");
  const signatureBuffer = Buffer.from(parts.v1, "hex");

  return digestBuffer.length === signatureBuffer.length && timingSafeEqual(digestBuffer, signatureBuffer);
}

async function getPlanByStripePriceId(supabase: any, stripePriceId: string | null) {
  if (!stripePriceId) return null;
  const { data } = await supabase.from("plans").select("id, slug").eq("stripe_price_id", stripePriceId).maybeSingle();
  return data ?? null;
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

async function downgradeToFree(supabase: any, userId: string, patch: Record<string, unknown>) {
  const { data: freePlan } = await supabase.from("plans").select("id").eq("slug", "free").single();
  if (!freePlan?.id) return;
  await supabase.from("subscriptions").upsert({ user_id: userId, plan_id: freePlan.id, ...patch }, { onConflict: "user_id" });
}

async function syncSubscriptionFromStripeEvent(supabase: any, event: StripeEvent) {
  const object = event.data?.object ?? {};

  const customerId = object.customer ?? null;
  const subscriptionId = object.subscription ?? (String(object.id ?? "").startsWith("sub_") ? object.id : null);
  const stripePriceId =
    object.items?.data?.[0]?.price?.id ?? object.lines?.data?.[0]?.price?.id ?? object.plan?.id ?? object.price?.id ?? null;
  const customerEmail = object.customer_details?.email ?? object.customer_email ?? object.email ?? null;

  const userId = await ensureUserIdByCustomerOrEmail(supabase, customerId, customerEmail);
  if (!userId) return;

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
    return;
  }

  const plan = await getPlanByStripePriceId(supabase, stripePriceId);
  if (!plan?.id) return;

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

  if (acceptedEvents.has(event.type)) await syncSubscriptionFromStripeEvent(supabase, event);

  await supabase
    .from("billing_events")
    .update({ processed: true })
    .eq("provider", "stripe")
    .eq("event_type", event.type)
    .eq("payload->>id", event.id);

  return NextResponse.json({ received: true });
}
