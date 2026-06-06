import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { findCustomerByEmail, createCustomer, updateCustomer } from "@/lib/asaas/customers";
import { createSubscription, listSubscriptionPayments, type AsaasBillingType } from "@/lib/asaas/subscriptions";
import { getPlans } from "@/lib/data/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_PLAN_SLUGS = new Set(["plus", "premium", "ministry_10", "ministry_20", "ministry_40"]);
const ALLOWED_METHODS = new Set(["pix", "boleto"]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

type ProfileRow = { id: string; email?: string | null; full_name?: string | null; phone?: string | null };
type ExistingSubscriptionRow = { id: string; gateway?: string | null; gateway_customer_id?: string | null; status?: string | null };

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
function findPaymentUrl(subscriptionUrl?: string | null, payments?: Awaited<ReturnType<typeof listSubscriptionPayments>>) {
  const payment = payments?.find((item) => item.invoiceUrl || item.bankSlipUrl || item.transactionReceiptUrl) ?? payments?.[0];
  return payment?.invoiceUrl || payment?.bankSlipUrl || subscriptionUrl || payment?.transactionReceiptUrl || null;
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
    const [{ data: profile }, { data: existingSubscriptions, error: existingError }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,phone").eq("id", user.id).maybeSingle(),
      supabase.from("subscriptions").select("id,gateway,gateway_customer_id,status").eq("user_id", user.id).order("updated_at", { ascending: false }).order("created_at", { ascending: false }).limit(10),
    ]);
    if (existingError) throw new Error(`Falha ao buscar assinatura atual: ${existingError.message}`);

    const typedProfile = (profile ?? null) as ProfileRow | null;
    const rows = (existingSubscriptions ?? []) as ExistingSubscriptionRow[];
    const existingAsaas = rows.find((subscription) => String(subscription.gateway ?? "").toLowerCase() === "asaas") ?? null;

    const existingAsaasCustomerId = existingAsaas?.gateway_customer_id ?? null;
    const customer = existingAsaasCustomerId
      ? await updateCustomer(existingAsaasCustomerId, { name: customerName(email, typedProfile, billingName), email, externalReference: user.id, phone: billingPhone || cleanValue(typedProfile?.phone), cpfCnpj: billingDocument })
      : (await findCustomerByEmail(email))
        ? await updateCustomer((await findCustomerByEmail(email))!.id, { name: customerName(email, typedProfile, billingName), email, externalReference: user.id, phone: billingPhone || cleanValue(typedProfile?.phone), cpfCnpj: billingDocument })
        : await createCustomer({ name: customerName(email, typedProfile, billingName), email, externalReference: user.id, phone: billingPhone || cleanValue(typedProfile?.phone), cpfCnpj: billingDocument });

    const billingType = billingTypeFromMethod(method);
    if (!billingType) throw new Error("Método de pagamento inválido.");

    const asaasSubscription = await createSubscription({ customerId: customer.id, billingType, value: plan.price_cents / 100, nextDueDate: nextDueDate(), description: `Harmomus ${plan.name}`, externalReference: user.id });
    const now = new Date().toISOString();
    const payload = {
      user_id: user.id,
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
    const result = existingAsaas?.id ? await supabase.from("subscriptions").update(payload).eq("id", existingAsaas.id).eq("user_id", user.id) : await supabase.from("subscriptions").insert({ ...payload, created_at: now });
    if (result.error) throw new Error(`Falha ao salvar assinatura Asaas: ${result.error.message}`);

    const payments = await listSubscriptionPayments(asaasSubscription.id, 3).catch(() => []);
    const paymentUrl = findPaymentUrl(asaasSubscription.paymentLink, payments);
    if (paymentUrl) return NextResponse.redirect(paymentUrl, { status: 303 });
    return NextResponse.redirect(appUrl(req, "/assinatura?message=Assinatura%20Asaas%20criada.%20Aguarde%20a%20cobran%C3%A7a."), { status: 303 });
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Não foi possível iniciar o checkout Asaas.");
    return NextResponse.redirect(appUrl(req, `/checkout?plan=${encodeURIComponent(planSlug || "premium")}&error=${message}`), { status: 303 });
  }
}
