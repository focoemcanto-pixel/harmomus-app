import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import { resolveWebhookRecipientForUser } from "@/lib/webhooks/recipient";
import type { WebhookEvent } from "@/types/webhooks";

function clean(value: unknown) {
  return String(value ?? "").trim() || null;
}

function planActivatedEvent(planSlug?: string | null): WebhookEvent | null {
  const plan = clean(planSlug)?.toLowerCase();
  if (plan === "plus") return "plan.plus_activated";
  if (plan === "premium") return "plan.premium_activated";
  if (plan?.startsWith("ministry")) return "plan.ministry_activated";
  return null;
}

function transitionEvent(previousPlan?: string | null, nextPlan?: string | null): WebhookEvent | null {
  const from = clean(previousPlan)?.toLowerCase();
  const to = clean(nextPlan)?.toLowerCase();
  if (from === "free" && to === "plus") return "upgrade.free_to_plus";
  if (from === "free" && to === "premium") return "upgrade.free_to_premium";
  if (from === "plus" && to === "premium") return "upgrade.plus_to_premium";
  return null;
}

export async function POST(request: Request) {
  const current = await getCurrentUserAccessContext();
  if (!current.isAdmin) return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const userId = clean(body?.user_id);
  const gatewaySubscriptionId = clean(body?.gateway_subscription_id);
  const explicitPlan = clean(body?.plan_slug ?? body?.plan);
  const explicitPreviousPlan = clean(body?.previous_plan_slug ?? body?.previous_plan);

  if (!userId && !gatewaySubscriptionId) {
    return NextResponse.json({ error: "Informe user_id ou gateway_subscription_id." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient() as any;

  let checkoutQuery = admin
    .from("billing_events")
    .select("id, created_at, payload")
    .eq("provider", "asaas")
    .eq("event_type", "checkout.asaas.started")
    .order("created_at", { ascending: false })
    .limit(1);

  if (gatewaySubscriptionId) {
    checkoutQuery = checkoutQuery.eq("payload->>gateway_subscription_id", gatewaySubscriptionId);
  } else if (userId) {
    checkoutQuery = checkoutQuery.eq("payload->>user_id", userId);
  }

  const { data: checkout, error: checkoutError } = await checkoutQuery.maybeSingle();
  if (checkoutError) return NextResponse.json({ error: checkoutError.message }, { status: 500 });
  if (!checkout?.id) return NextResponse.json({ error: "Checkout Asaas não encontrado." }, { status: 404 });

  const payload = (checkout.payload ?? {}) as Record<string, unknown>;
  const resolvedUserId = clean(userId) ?? clean(payload.user_id);
  const planSlug = clean(explicitPlan) ?? clean(payload.plan_slug);
  const previousPlanSlug = clean(explicitPreviousPlan) ?? clean(payload.previous_plan_slug) ?? "free";
  const localSubscriptionId = clean(payload.reused_subscription_id);
  const providerSubscriptionId = clean(gatewaySubscriptionId) ?? clean(payload.gateway_subscription_id);
  const customerId = clean(payload.gateway_customer_id);

  if (!resolvedUserId || !planSlug) {
    return NextResponse.json({ error: "Checkout Asaas sem user_id ou plan_slug." }, { status: 400 });
  }

  const { data: plan, error: planError } = await admin.from("plans").select("id, slug").eq("slug", planSlug).maybeSingle();
  if (planError) return NextResponse.json({ error: planError.message }, { status: 500 });
  if (!plan?.id) return NextResponse.json({ error: `Plano ${planSlug} não encontrado.` }, { status: 404 });

  const subscriptionPatch = {
    plan_id: plan.id,
    status: "active",
    gateway: "asaas",
    gateway_customer_id: customerId,
    gateway_subscription_id: providerSubscriptionId,
    starts_at: new Date().toISOString(),
    last_webhook_event: "manual_asaas_checkout_replay",
    updated_at: new Date().toISOString(),
  };

  const subscriptionResult = localSubscriptionId
    ? await admin.from("subscriptions").update(subscriptionPatch).eq("id", localSubscriptionId).select("id").maybeSingle()
    : await admin.from("subscriptions").update(subscriptionPatch).eq("user_id", resolvedUserId).select("id").order("updated_at", { ascending: false }).limit(1).maybeSingle();

  if (subscriptionResult.error) return NextResponse.json({ error: subscriptionResult.error.message }, { status: 500 });

  const recipient = await resolveWebhookRecipientForUser(admin, resolvedUserId, { email: clean(payload.email) });
  const eventCandidates = [
    planActivatedEvent(planSlug),
    transitionEvent(previousPlanSlug, planSlug),
    "payment.approved" as WebhookEvent,
  ].filter(Boolean) as WebhookEvent[];

  const data = {
    user_id: resolvedUserId,
    userId: resolvedUserId,
    email: recipient.email,
    name: recipient.name,
    fullName: recipient.name,
    phone: recipient.phone,
    whatsapp: recipient.phone,
    plan_slug: planSlug,
    planSlug,
    previous_plan_slug: previousPlanSlug,
    previousPlanSlug,
    provider: "asaas",
    source: "admin.asaas_checkout_replay",
    gateway_subscription_id: providerSubscriptionId,
    gateway_customer_id: customerId,
    local_subscription_id: subscriptionResult.data?.id ?? localSubscriptionId,
    amount: payload.value ?? null,
    value: payload.value ?? null,
    method: payload.method ?? null,
    replayed: true,
    replayed_at: new Date().toISOString(),
    replayed_by: current.profile?.id ?? null,
  };

  const dispatchResults = [];
  for (const event of Array.from(new Set(eventCandidates))) {
    const result = await dispatchWebhookEvent({ event, source: "admin.asaas_checkout_replay", recipient, data });
    dispatchResults.push({ event, result });
  }

  await admin.from("billing_events").insert({
    provider: "asaas",
    event_type: "manual.asaas.checkout_replayed",
    payload: {
      ...data,
      checkout_event_id: checkout.id,
      dispatched_events: dispatchResults.map((item) => item.event),
    },
    processed: true,
    processed_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, recipient, data, dispatched: dispatchResults });
}
