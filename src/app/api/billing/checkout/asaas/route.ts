import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { findCustomerByEmail, createCustomer, updateCustomer } from "@/lib/asaas/customers";
import { createSubscription, cancelSubscription, listSubscriptionPayments, type AsaasBillingType, type AsaasPayment } from "@/lib/asaas/subscriptions";
import { getPlans } from "@/lib/data/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_PLAN_SLUGS = new Set(["plus", "premium", "ministry_10", "ministry_20", "ministry_40"]);
const ALLOWED_METHODS = new Set(["pix", "boleto"]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;
const OVERDUE_REUSE_DAYS = 7;

type ProfileRow = { id: string; email?: string | null; full_name?: string | null; phone?: string | null };
type ExistingSubscriptionRow = {
  id: string;
  user_id?: string | null;
  plan_id?: string | null;
  gateway?: string | null;
  gateway_customer_id?: string | null;
  gateway_subscription_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
  next_billing_at?: string | null;
  plans?: { slug?: string | null } | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function cleanValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 500) : null;
}
function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}
function appUrl(req: Request, path: string) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || req.url);
}
function loginRedirectUrl(req: Request, planSlug: string, method: string) {
  const checkout = new URL("/checkout", req.url);
  checkout.searchParams.set("plan", planSlug || "premium");
  checkout.searchParams.set("method", method);
  return appUrl(req, `/login?redirect=${encodeURIComponent(`${checkout.pathname}${checkout.search}`)}`);
}
function billingTypeFromMethod(method: string): AsaasBillingType | null {
  if (method === "pix") return "PIX";
  if (method === "boleto") return "BOLETO";
  return null;
}
function nextDueDate() {
  return new Date().toISOString().slice(0, 10);
}
function customerName(userEmail: string, profile: ProfileRow | null, billingName?: string | null) {
  return cleanValue(billingName) || cleanValue(profile?.full_name) || userEmail.split("@")[0] || "Cliente Harmomus";
}
function attributionFromUrl(url: URL) {
  const attribution: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanValue(url.searchParams.get(key));
    if (value) attribution[key] = value;
  }
  return attribution;
}
function normalizePaymentStatus(payment?: AsaasPayment | null) {
  return String(payment?.status ?? "").trim().toLowerCase();
}
function paymentDueDate(payment?: AsaasPayment | null) {
  if (!payment?.dueDate) return null;
  const date = new Date(`${payment.dueDate}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function overdueDays(payment?: AsaasPayment | null) {
  const due = paymentDueDate(payment);
  if (!due) return 0;
  return Math.floor((Date.now() - due.getTime()) / (24 * 60 * 60 * 1000));
}
function paymentUrl(payment?: AsaasPayment | null, subscriptionUrl?: string | null) {
  return payment?.invoiceUrl || payment?.bankSlipUrl || subscriptionUrl || payment?.transactionReceiptUrl || null;
}
function findReusablePayment(subscriptionUrl?: string | null, payments?: Awaited<ReturnType<typeof listSubscriptionPayments>>) {
  const candidates = payments ?? [];
  const pending = candidates.find((payment) => ["pending", "open"].includes(normalizePaymentStatus(payment)) && paymentUrl(payment, subscriptionUrl));
  if (pending) return { payment: pending, url: paymentUrl(pending, subscriptionUrl), reusable: true, reason: "pending_payment" };

  const overdue = candidates.find((payment) => normalizePaymentStatus(payment) === "overdue" && paymentUrl(payment, subscriptionUrl));
  if (overdue) {
    const days = overdueDays(overdue);
    return { payment: overdue, url: paymentUrl(overdue, subscriptionUrl), reusable: days <= OVERDUE_REUSE_DAYS, reason: days <= OVERDUE_REUSE_DAYS ? "recent_overdue_payment" : "stale_overdue_payment" };
  }

  const fallback = candidates.find((payment) => paymentUrl(payment, subscriptionUrl));
  return { payment: fallback ?? null, url: paymentUrl(fallback, subscriptionUrl), reusable: false, reason: "no_reusable_payment" };
}
function findPaymentUrl(subscriptionUrl?: string | null, payments?: Awaited<ReturnType<typeof listSubscriptionPayments>>) {
  const reusable = findReusablePayment(subscriptionUrl, payments);
  return reusable.reusable ? reusable.url : null;
}
function subscriptionTime(subscription: ExistingSubscriptionRow) {
  const value = subscription.updated_at ?? subscription.created_at ?? "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
function normalizeStatus(subscription?: ExistingSubscriptionRow | null) {
  return String(subscription?.status ?? "").trim().toLowerCase();
}
function normalizePlanSlug(subscription?: ExistingSubscriptionRow | null) {
  return String(subscription?.plans?.slug ?? "free").trim().toLowerCase() || "free";
}
function isReusableSubscription(subscription: ExistingSubscriptionRow) {
  const status = normalizeStatus(subscription);
  return !["canceled", "cancelled", "expired"].includes(status);
}
function isActiveSubscription(subscription?: ExistingSubscriptionRow | null) {
  return ["active", "trialing"].includes(normalizeStatus(subscription));
}
function planRank(slug?: string | null) {
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (normalized.startsWith("ministry")) return 3;
  if (normalized === "premium") return 2;
  if (normalized === "plus") return 1;
  return 0;
}
function hasFutureAccess(subscription?: ExistingSubscriptionRow | null) {
  if (!isActiveSubscription(subscription)) return false;
  if (!subscription?.current_period_end) return true;
  const time = Date.parse(subscription.current_period_end);
  return Number.isNaN(time) || time > Date.now();
}
function pickSubscriptionToUpdate(rows: ExistingSubscriptionRow[]) {
  const reusable = rows.filter(isReusableSubscription).sort((a, b) => subscriptionTime(b) - subscriptionTime(a));
  if (!reusable.length) return null;
  return reusable.find((subscription) => String(subscription.gateway ?? "").toLowerCase() === "asaas") ?? reusable[0];
}
function pickReusableAsaasSubscription(rows: ExistingSubscriptionRow[], planSlug: string) {
  const asaasRows = rows
    .filter((subscription) => String(subscription.gateway ?? "").toLowerCase() === "asaas")
    .filter(isReusableSubscription)
    .sort((a, b) => subscriptionTime(b) - subscriptionTime(a));

  const active = asaasRows.find((subscription) => hasFutureAccess(subscription));
  if (active && planRank(normalizePlanSlug(active)) >= planRank(planSlug)) return active;

  return asaasRows.find((subscription) => normalizePlanSlug(subscription) === planSlug && subscription.gateway_subscription_id) ?? null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const planSlug = String(url.searchParams.get("plan") ?? "").trim().toLowerCase();
  const method = String(url.searchParams.get("method") ?? "").trim().toLowerCase();

  try {
    if (!ALLOWED_PLAN_SLUGS.has(planSlug)) return NextResponse.redirect(appUrl(req, "/assinar?error=Plano%20inv%C3%A1lido"), { status: 303 });
    if (!ALLOWED_METHODS.has(method)) return NextResponse.redirect(appUrl(req, `/checkout?plan=${encodeURIComponent(planSlug)}&error=M%C3%A9todo%20inv%C3%A1lido`), { status: 303 });

    const billingName = cleanValue(url.searchParams.get("name"));
    const billingDocument = onlyDigits(url.searchParams.get("cpfCnpj"));
    const billingPhone = onlyDigits(url.searchParams.get("phone"));
    if (!billingName || ![11, 14].includes(billingDocument.length)) {
      return NextResponse.redirect(appUrl(req, `/checkout?plan=${encodeURIComponent(planSlug)}&error=${encodeURIComponent("Informe nome e CPF/CNPJ para pagar com Pix ou boleto.")}`), { status: 303 });
    }

    const user = await getCurrentUser();
    if (!user?.email) return NextResponse.redirect(loginRedirectUrl(req, planSlug, method), { status: 303 });

    const email = user.email.trim().toLowerCase();
    const plans = await getPlans();
    const plan = plans.find((item) => item.slug === planSlug && ALLOWED_PLAN_SLUGS.has(item.slug));
    if (!plan?.id || typeof plan.price_cents !== "number" || plan.price_cents <= 0) return NextResponse.redirect(appUrl(req, "/assinar?error=Plano%20inv%C3%A1lido"), { status: 303 });

    const supabase = createSupabaseAdminClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id,email,full_name,phone")
      .or(`id.eq.${user.id},email.ilike.${email}`)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const typedProfile = (profile ?? null) as ProfileRow | null;
    const billingUserId = typedProfile?.id ?? user.id;
    const userIds = Array.from(new Set([user.id, billingUserId].filter(Boolean)));

    const { data: existingSubscriptions, error: existingError } = await supabase
      .from("subscriptions")
      .select("id,user_id,plan_id,gateway,gateway_customer_id,gateway_subscription_id,status,current_period_end,next_billing_at,updated_at,created_at,plans(slug)")
      .in("user_id", userIds)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (existingError) throw new Error(`Falha ao buscar assinatura atual: ${existingError.message}`);

    const rows = (existingSubscriptions ?? []) as ExistingSubscriptionRow[];
    const subscriptionToUpdate = pickSubscriptionToUpdate(rows);
    const existingAsaas = rows.find((subscription) => String(subscription.gateway ?? "").toLowerCase() === "asaas") ?? null;
    const reusableAsaas = pickReusableAsaasSubscription(rows, planSlug);
    const previousPlanSlug = String(subscriptionToUpdate?.plans?.slug ?? existingAsaas?.plans?.slug ?? "free").trim().toLowerCase() || "free";

    if (reusableAsaas?.id && hasFutureAccess(reusableAsaas)) {
      return NextResponse.redirect(appUrl(req, "/assinatura?message=Sua%20assinatura%20j%C3%A1%20est%C3%A1%20ativa."), { status: 303 });
    }

    if (reusableAsaas?.gateway_subscription_id) {
      const payments = await listSubscriptionPayments(reusableAsaas.gateway_subscription_id, 6).catch(() => []);
      const reusablePayment = findReusablePayment(null, payments);
      if (reusablePayment.reusable && reusablePayment.url) {
        await supabase.from("billing_events").insert({
          provider: "asaas",
          event_type: "checkout.asaas.reused",
          payload: {
            user_id: billingUserId,
            auth_user_id: user.id,
            email,
            plan_slug: plan.slug,
            reused_subscription_id: reusableAsaas.id,
            gateway_customer_id: reusableAsaas.gateway_customer_id ?? null,
            gateway_subscription_id: reusableAsaas.gateway_subscription_id,
            payment_id: reusablePayment.payment?.id ?? null,
            reuse_reason: reusablePayment.reason,
            method,
          },
          processed: true,
        }).then(({ error }) => {
          if (error) console.error("[asaas.checkout] Falha ao registrar reuso de checkout", error);
        });
        return NextResponse.redirect(reusablePayment.url, { status: 303 });
      }

      if (reusablePayment.reason === "stale_overdue_payment") {
        await cancelSubscription(reusableAsaas.gateway_subscription_id).catch((error) => {
          console.warn("[asaas.checkout] Não foi possível cancelar assinatura Asaas vencida antes de recriar", error);
        });
        const now = new Date().toISOString();
        await supabase.from("subscriptions").update({ status: "canceled", auto_renew: false, next_billing_at: null, canceled_at: now, updated_at: now }).eq("id", reusableAsaas.id);
        await supabase.from("billing_events").insert({
          provider: "asaas",
          event_type: "checkout.asaas.stale_overdue_replaced",
          payload: {
            user_id: billingUserId,
            auth_user_id: user.id,
            email,
            plan_slug: plan.slug,
            canceled_subscription_id: reusableAsaas.id,
            gateway_subscription_id: reusableAsaas.gateway_subscription_id,
            payment_id: reusablePayment.payment?.id ?? null,
            overdue_days: overdueDays(reusablePayment.payment),
            method,
          },
          processed: true,
        }).then(({ error }) => {
          if (error) console.error("[asaas.checkout] Falha ao registrar substituição de cobrança vencida", error);
        });
      }
    }

    const existingAsaasCustomerId = existingAsaas?.gateway_customer_id ?? null;
    const foundCustomer = existingAsaasCustomerId ? null : await findCustomerByEmail(email);
    const customerPayload = { name: customerName(email, typedProfile, billingName), email, externalReference: billingUserId, phone: billingPhone || cleanValue(typedProfile?.phone), cpfCnpj: billingDocument };
    const customer = existingAsaasCustomerId
      ? await updateCustomer(existingAsaasCustomerId, customerPayload)
      : foundCustomer
        ? await updateCustomer(foundCustomer.id, customerPayload)
        : await createCustomer(customerPayload);

    const billingType = billingTypeFromMethod(method);
    if (!billingType) throw new Error("Método de pagamento inválido.");

    const asaasSubscription = await createSubscription({ customerId: customer.id, billingType, value: plan.price_cents / 100, nextDueDate: nextDueDate(), description: `Harmomus ${plan.name}`, externalReference: billingUserId });
    const now = new Date().toISOString();
    const payload = {
      user_id: billingUserId,
      plan_id: plan.id,
      status: "pending",
      gateway: "asaas",
      gateway_customer_id: customer.id,
      gateway_subscription_id: asaasSubscription.id,
      next_billing_at: asaasSubscription.nextDueDate ? new Date(`${asaasSubscription.nextDueDate}T12:00:00.000Z`).toISOString() : null,
      current_period_end: asaasSubscription.nextDueDate ? new Date(`${asaasSubscription.nextDueDate}T12:00:00.000Z`).toISOString() : null,
      auto_renew: true,
      updated_at: now,
      ...attributionFromUrl(url),
    };
    const result = subscriptionToUpdate?.id
      ? await supabase.from("subscriptions").update(payload).eq("id", subscriptionToUpdate.id)
      : await supabase.from("subscriptions").insert({ ...payload, created_at: now });
    if (result.error) throw new Error(`Falha ao salvar assinatura Asaas: ${result.error.message}`);

    const { error: checkoutLogError } = await supabase.from("billing_events").insert({
      provider: "asaas",
      event_type: "checkout.asaas.started",
      payload: {
        user_id: billingUserId,
        auth_user_id: user.id,
        email,
        plan_slug: plan.slug,
        previous_plan_slug: previousPlanSlug,
        reused_subscription_id: subscriptionToUpdate?.id ?? null,
        gateway_customer_id: customer.id,
        gateway_subscription_id: asaasSubscription.id,
        value: plan.price_cents / 100,
        method,
      },
      processed: true,
    });
    if (checkoutLogError) console.error("[asaas.checkout] Falha ao registrar checkout no billing_events", checkoutLogError);

    const payments = await listSubscriptionPayments(asaasSubscription.id, 3).catch(() => []);
    const paymentUrl = findPaymentUrl(asaasSubscription.paymentLink, payments);
    if (paymentUrl) return NextResponse.redirect(paymentUrl, { status: 303 });
    return NextResponse.redirect(appUrl(req, "/assinatura?message=Assinatura%20Asaas%20criada.%20Aguarde%20a%20cobran%C3%A7a."), { status: 303 });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Não foi possível iniciar o checkout Asaas.");
    return NextResponse.redirect(appUrl(req, `/checkout?plan=${encodeURIComponent(planSlug || "premium")}&error=${message}`), { status: 303 });
  }
}
