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

export async function createCheckoutSession(input: { customerId: string; priceId: string; successUrl: string; cancelUrl: string; trialDays?: number }) {
  const form = new URLSearchParams({
    mode: "subscription",
    customer: input.customerId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][price]": input.priceId,
    "line_items[0][quantity]": "1",
    allow_promotion_codes: "true",
  });

  if (input.trialDays) form.set("subscription_data[trial_period_days]", String(input.trialDays));

  return stripe<{ url: string }>("/checkout/sessions", form);
}

export async function getCheckoutSession(sessionId: string) {
  const query = new URLSearchParams({
    "expand[]": "subscription",
  });
  return stripe<any>(`/checkout/sessions/${encodeURIComponent(sessionId)}?${query.toString()}`, undefined, "GET");
}

export async function createCustomerPortalSession(customerId: string, returnUrl: string) {
  return stripe<{ url: string }>("/billing_portal/sessions", new URLSearchParams({ customer: customerId, return_url: returnUrl }));
}

export async function cancelSubscription(subscriptionId: string) {
  return stripe(`/subscriptions/${subscriptionId}/cancel`, new URLSearchParams());
}

export async function getSubscription(subscriptionId: string) {
  return stripe<any>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, "GET");
}

export async function updateSubscription(subscriptionId: string, priceId: string) {
  return stripe(`/subscriptions/${subscriptionId}`, new URLSearchParams({ "items[0][id]": "si_placeholder", "items[0][price]": priceId }));
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
  return stripe<any>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, undefined, "GET");
}

export function getPriceByPlan(plan: Pick<Plan, "slug" | "stripe_price_id">) {
  return plan.slug === "free" ? null : plan.stripe_price_id;
}
