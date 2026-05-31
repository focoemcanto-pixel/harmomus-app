import type { Database } from "@/types/database";

type Plan = Database["public"]["Tables"]["plans"]["Row"];
const api = "https://api.stripe.com/v1";

const key = () => {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error("Configuração ausente: STRIPE_SECRET_KEY.");
  return value;
};

async function stripe<T>(path: string, body?: URLSearchParams, method = "POST"): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : body?.toString(),
  });

  if (!res.ok) {
    let detail = `Stripe error ${res.status}`;
    try {
      const payload = (await res.json()) as { error?: { message?: string } };
      if (payload.error?.message) detail = payload.error.message;
    } catch {
      // keep fallback message
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

export async function getOrCreateCustomer(params: { email: string; userId: string; existingCustomerId?: string | null }) {
  if (params.existingCustomerId) return params.existingCustomerId;

  const query = new URLSearchParams({ email: params.email, limit: "1" });
  const existing = await stripe<{ data: Array<{ id: string }> }>(`/customers?${query.toString()}`, undefined, "GET");
  if (existing.data?.[0]?.id) return existing.data[0].id;

  const form = new URLSearchParams({ email: params.email, "metadata[user_id]": params.userId });
  const customer = await stripe<{ id: string }>("/customers", form);
  return customer.id;
}

export async function createCheckoutSession(input: {
  customerId?: string;
  customerEmail?: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, string | null | undefined>;
}) {
  const form = new URLSearchParams({
    mode: "subscription",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
  });

  if (input.customerId) form.set("customer", input.customerId);
  else if (input.customerEmail) form.set("customer_email", input.customerEmail);

  if (input.trialDays) form.set("subscription_data[trial_period_days]", String(input.trialDays));

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (value) {
      form.set(`metadata[${key}]`, value);
      form.set(`subscription_data[metadata][${key}]`, value);
    }
  }

  return stripe<{ url: string }>("/checkout/sessions", form);
}

export async function getCheckoutSession(sessionId: string) {
  console.log("[stripe.client.getCheckoutSession] iniciando busca", { session_id: sessionId });

  const query = new URLSearchParams({
    "expand[]": "subscription",
  });

  try {
    const session = await stripe<any>(`/checkout/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`, undefined, "GET");

    console.log("[stripe.client.getCheckoutSession] sessão Stripe encontrada", {
      session_id: sessionId,
      session_mode: session?.mode ?? null,
      session_customer: typeof session?.customer === "string" ? session.customer : session?.customer?.id ?? null,
      session_subscription: typeof session?.subscription === "string" ? session.subscription : session?.subscription?.id ?? null,
      session_customer_email: session?.customer_email ?? session?.customer_details?.email ?? null,
      session_metadata: session?.metadata ?? null,
      metadata_user_id: session?.metadata?.user_id ?? null,
      metadata_email: session?.metadata?.email ?? null,
    });

    if (!session?.metadata?.user_id) {
      console.error("[stripe.client.getCheckoutSession] USER_ID_MISSING", { session_id: sessionId, session_metadata: session?.metadata ?? null });
    }

    if (!session?.subscription) {
      console.error("[stripe.client.getCheckoutSession] SESSION_SUBSCRIPTION_NULL", { session_id: sessionId });
    }

    return session;
  } catch (error) {
    console.error("[stripe.client.getCheckoutSession] erro ao buscar sessão Stripe", { session_id: sessionId, error });
    throw error;
  }
}

export async function createCustomerPortalSession(customerId: string, returnUrl: string) {
  return stripe<{ url: string }>("/billing_portal/sessions", new URLSearchParams({ customer: customerId, return_url: returnUrl }));
}

export async function cancelSubscription(subscriptionId: string) {
  return stripe(`/subscriptions/${subscriptionId}/cancel`, new URLSearchParams());
}

export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  return stripe<any>(
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    new URLSearchParams({
      cancel_at_period_end: "true",
    }),
  );
}

export async function getSubscription(subscriptionId: string) {
  return stripe<any>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, "GET");
}

export async function listCustomerSubscriptions(customerId: string) {
  const query = new URLSearchParams({
    customer: customerId,
    status: "all",
    limit: "10",
    "expand[]": "data.items.data.price",
  });
  return stripe<any>(`/subscriptions?${query.toString()}`, undefined, "GET");
}

export async function getBestCustomerSubscription(customerId: string) {
  const subscriptions = await listCustomerSubscriptions(customerId);
  const data = Array.isArray(subscriptions?.data) ? subscriptions.data : [];
  const preferredStatuses = ["active", "trialing", "past_due"];

  return data.find((subscription: any) => preferredStatuses.includes(String(subscription?.status ?? "")))
    ?? data.find((subscription: any) => String(subscription?.status ?? "") !== "canceled")
    ?? data[0]
    ?? null;
}

export async function updateSubscription(subscriptionId: string, priceId: string) {
  const subscription = await getSubscription(subscriptionId);
  const subscriptionItemId = subscription?.items?.data?.[0]?.id;

  if (!subscriptionItemId) {
    throw new Error("Não foi possível localizar o item da assinatura no Stripe.");
  }

  return stripe(`/subscriptions/${encodeURIComponent(subscriptionId)}`, new URLSearchParams({
    "items[0][id]": subscriptionItemId,
    "items[0][price]": priceId,
    proration_behavior: "create_prorations",
  }));
}

export async function listCustomerInvoices(customerId: string, limit = 24) {
  const query = new URLSearchParams({
    customer: customerId,
    limit: String(limit),
  });
  return stripe<any>(`/invoices?${query.toString()}`, undefined, "GET");
}

export async function getCustomerPaymentMethods(customerId: string, limit = 3) {
  const query = new URLSearchParams({
    customer: customerId,
    type: "card",
    limit: String(limit),
  });
  return stripe<any>(`/payment_methods?${query.toString()}`, undefined, "GET");
}

export async function getStripeSubscription(subscriptionId: string) {
  console.log("[stripe.client.getStripeSubscription] iniciando busca", { subscription_id: subscriptionId });

  try {
    const subscription = await stripe<any>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, "GET");

    console.log("[stripe.client.getStripeSubscription] subscription encontrada no Stripe", {
      subscription_encontrada_no_stripe: Boolean(subscription?.id),
      stripe_status: subscription?.status ?? null,
      customer_id: typeof subscription?.customer === "string" ? subscription.customer : subscription?.customer?.id ?? null,
      subscription_id: subscription?.id ?? subscriptionId,
      price_id: subscription?.items?.data?.[0]?.price?.id ?? null,
      current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      metadata: subscription?.metadata ?? null,
      metadata_user_id: subscription?.metadata?.user_id ?? null,
      metadata_email: subscription?.metadata?.email ?? null,
    });

    if (!subscription?.metadata?.user_id) {
      console.error("[stripe.client.getStripeSubscription] USER_ID_MISSING", {
        subscription_id: subscription?.id ?? subscriptionId,
        metadata: subscription?.metadata ?? null,
      });
    }

    return subscription;
  } catch (error) {
    console.error("[stripe.client.getStripeSubscription] erro ao buscar subscription Stripe", { subscription_id: subscriptionId, error });
    throw error;
  }
}

export function getPriceByPlan(plan: Pick<Plan, "slug" | "stripe_price_id">) {
  return plan.slug === "free" ? null : plan.stripe_price_id;
}
