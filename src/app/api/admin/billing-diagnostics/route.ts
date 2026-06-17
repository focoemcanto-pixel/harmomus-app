import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { resolveEffectivePlan } from "@/lib/access/subscription-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function mask(value: unknown) { const text = String(value ?? "").trim(); if (!text) return null; if (text.length <= 10) return `${text.slice(0, 3)}***`; return `${text.slice(0, 6)}***${text.slice(-4)}`; }
function normalizeEmail(value: unknown) { return String(value ?? "").trim().toLowerCase(); }
function accessLabel(subscription: any, effectiveSlug: string) { const contractedSlug = String(subscription.plan?.slug ?? "").toLowerCase(); if ((contractedSlug === "premium" || contractedSlug.startsWith("ministry")) && effectiveSlug === "free") return "Plano pago sem acesso efetivo"; return effectiveSlug === "premium" ? "Premium com acesso ativo" : effectiveSlug; }
function serializeSubscription(subscription: any) { const effectiveSlug = resolveEffectivePlan({ subscription, plan: subscription.plan }); return { id: subscription.id, userId: subscription.user_id, plan: subscription.plan, effectiveSlug, accessLabel: accessLabel(subscription, effectiveSlug), status: subscription.status, gateway: subscription.gateway, stripeCustomerId: mask(subscription.stripe_customer_id), gatewayCustomerId: mask(subscription.gateway_customer_id), stripeSubscriptionId: mask(subscription.stripe_subscription_id), gatewaySubscriptionId: mask(subscription.gateway_subscription_id), stripePriceId: mask(subscription.stripe_price_id), currentPeriodEnd: subscription.current_period_end, nextBillingAt: subscription.next_billing_at, trialEndsAt: subscription.trial_ends_at, autoRenew: subscription.auto_renew, cancelAtPeriodEnd: subscription.cancel_at_period_end, canceledAt: subscription.canceled_at, lastWebhookEvent: subscription.last_webhook_event, createdAt: subscription.created_at, updatedAt: subscription.updated_at }; }
function serializeEvent(event: any) { return { id: event.id, provider: event.provider, eventType: event.event_type, processed: event.processed, createdAt: event.created_at, errorMessage: event.error_message ?? null, asaasEventId: event.payload?.external_event_id ?? event.payload?.id ?? null, asaasCustomerId: mask(event.payload?.payment?.customer ?? event.payload?.subscription?.customer ?? event.payload?.gateway_customer_id), asaasSubscriptionId: mask(event.payload?.payment?.subscription ?? event.payload?.subscription?.id ?? event.payload?.gateway_subscription_id), asaasPaymentId: mask(event.payload?.payment?.id ?? event.payload?.payment_id), userId: event.payload?.user_id ?? event.payload?.userId ?? null, email: event.payload?.email ?? null }; }

export async function GET(request: Request) {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!context.isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const admin = createSupabaseAdminClient() as any;
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("email"));
  let userIds: string[] | null = null;
  let profile: any = null;

  if (email) {
    const { data: profiles, error: profileError } = await admin.from("profiles").select("id,email,full_name,role,created_at,updated_at").ilike("email", email).limit(10);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    profile = profiles?.[0] ?? null;
    userIds = (profiles ?? []).map((item: any) => item.id).filter(Boolean);
    if (!userIds.length) return NextResponse.json({ generatedAt: new Date().toISOString(), target: { email, profile: null }, recentSubscriptions: [], recentBillingEvents: [], warning: "Nenhum profile encontrado para este e-mail." });
  }

  const subscriptionQuery = admin.from("subscriptions").select("id,user_id,plan_id,status,gateway,stripe_customer_id,gateway_customer_id,stripe_subscription_id,gateway_subscription_id,stripe_price_id,current_period_end,next_billing_at,trial_ends_at,auto_renew,cancel_at_period_end,canceled_at,last_webhook_event,created_at,updated_at,plan:plans(slug,name)").order("updated_at", { ascending: false }).limit(email ? 10 : 20);
  const eventQuery = admin.from("billing_events").select("id,provider,event_type,processed,error_message,created_at,payload").order("created_at", { ascending: false }).limit(email ? 50 : 20);
  const filteredSubscriptionQuery = userIds ? subscriptionQuery.in("user_id", userIds) : subscriptionQuery;
  const filteredEventQuery = email ? eventQuery.or(`payload->>email.ilike.${email},payload->>user_id.in.(${(userIds ?? []).join(",")}),payload->>userId.in.(${(userIds ?? []).join(",")})`) : eventQuery;

  const [{ data: subscriptions, error: subscriptionsError }, { data: billingEvents, error: billingEventsError }] = await Promise.all([filteredSubscriptionQuery, filteredEventQuery]);
  if (subscriptionsError) return NextResponse.json({ error: subscriptionsError.message }, { status: 500 });
  if (billingEventsError) return NextResponse.json({ error: billingEventsError.message }, { status: 500 });

  return NextResponse.json({ generatedAt: new Date().toISOString(), target: email ? { email, profile, userIds } : null, currentUser: { effectiveSlug: context.effectiveSlug, isAdmin: context.isAdmin, profileId: context.profile?.id ?? null, profileEmail: context.profile?.email ?? null, currentSubscription: context.subscription ? { id: context.subscription.id, status: context.subscription.status, planId: context.subscription.plan_id, stripeCustomerId: mask(context.subscription.stripe_customer_id), stripeSubscriptionId: mask(context.subscription.stripe_subscription_id), gatewayCustomerId: mask((context.subscription as any).gateway_customer_id), gatewaySubscriptionId: mask((context.subscription as any).gateway_subscription_id), currentPeriodEnd: context.subscription.current_period_end, nextBillingAt: context.subscription.next_billing_at, lastWebhookEvent: context.subscription.last_webhook_event, updatedAt: context.subscription.updated_at } : null }, environment: { hasStripeSecretKey: Boolean(process.env.STRIPE_SECRET_KEY), hasStripeWebhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET), hasAsaasWebhookToken: Boolean(process.env.ASAAS_WEBHOOK_TOKEN), appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null }, recentSubscriptions: (subscriptions ?? []).map(serializeSubscription), recentBillingEvents: (billingEvents ?? []).map(serializeEvent) });
}
