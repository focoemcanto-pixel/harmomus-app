import Link from "next/link";

import { MetaPurchaseEvent } from "@/components/analytics/meta-purchase-event";
import { EmailConfirmationState } from "@/components/auth/email-confirmation-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCheckoutSession, getStripeSubscription } from "@/lib/stripe/client";
import { isActiveSubscriptionStatus } from "@/lib/access/subscription-plan";
import { mapStripeStatus } from "@/lib/stripe/status";

const WHATSAPP_PREMIUM_URL = "https://chat.whatsapp.com/FNU6Xl5t6qD0VfGA2EQ0IW?mode=gi_t";
const ACCESS_READY_STATUSES = new Set(["active", "trialing"]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

type CheckoutSuccessProps = {
  searchParams?: Promise<{ session_id?: string }> | { session_id?: string };
};

type SyncCheckoutResult = {
  synced: boolean;
  accessReady: boolean;
  planSlug: string | null;
  subscriptionStatus: string | null;
  error: string | null;
  onboardingStatus: string | null;
  customerEmail: string | null;
  confirmationEmailResent: boolean;
};

function normalize(value: unknown) {
  return String(value ?? "").trim() || null;
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase() || null;
}

function cleanAttributionValue(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, 500);
}

function pickStripeAttribution(session: any, subscription: any) {
  const attribution: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = cleanAttributionValue(session?.metadata?.[key] ?? subscription?.metadata?.[key]);
    if (value) attribution[key] = value;
  }
  return attribution;
}

function getPlanSlugFromPrice(priceId: string | null) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return "premium";
  if (priceId === process.env.STRIPE_MINISTRY_10_PRICE_ID) return "ministry_10";
  if (priceId === process.env.STRIPE_MINISTRY_20_PRICE_ID) return "ministry_20";
  if (priceId === process.env.STRIPE_MINISTRY_40_PRICE_ID) return "ministry_40";
  return null;
}

function getStripeId(value: unknown) {
  if (typeof value === "string") return normalize(value);
  if (value && typeof value === "object" && "id" in value) return normalize((value as { id?: unknown }).id);
  return null;
}

function getCustomerIdFromSession(session: any) {
  return getStripeId(session?.customer);
}

function getSubscriptionIdFromSession(session: any) {
  return getStripeId(session?.subscription);
}

function getCustomerEmailFromSession(session: any) {
  return normalizeEmail(session?.metadata?.email ?? session?.customer_details?.email ?? session?.customer_email);
}

function isAccessReady(status: string | null) {
  return ACCESS_READY_STATUSES.has(String(status ?? "").toLowerCase());
}

function planDisplayName(planSlug: string | null) {
  if (planSlug === "plus") return "Plus";
  if (planSlug === "premium") return "Premium";
  if (planSlug?.startsWith("ministry_")) return "Ministerial";
  return "Plus/Premium";
}

async function resendSignupConfirmation(supabase: any, email: string | null) {
  if (!email) return false;

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || null;
  const emailRedirectTo = base ? `${base}/auth/confirm/callback?next=${encodeURIComponent("/login?confirmed=1")}` : undefined;

  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (error) {
    console.error("[checkout.success] Falha ao reenviar confirmação de e-mail", error);
    return false;
  }

  return true;
}

async function findProfileForCheckout(admin: any, userId: string | null, email: string | null) {
  if (userId) {
    const response = await admin
      .from("profiles")
      .select("id,email,onboarding_status")
      .eq("id", userId)
      .maybeSingle();

    if (response.error) console.error("[checkout.success.findProfileForCheckout] erro Supabase por user_id", response.error);
    if (response.data?.id) return response.data;
  }

  if (email) {
    const response = await admin
      .from("profiles")
      .select("id,email,onboarding_status")
      .ilike("email", email)
      .maybeSingle();

    if (response.error) console.error("[checkout.success.findProfileForCheckout] erro Supabase por email", response.error);
    if (response.data?.id) return response.data;
  }

  console.error("[checkout.success.findProfileForCheckout] PROFILE_NOT_FOUND", { metadata_user_id: userId, metadata_email: email });
  return null;
}

function syncResult(input: Partial<SyncCheckoutResult>): SyncCheckoutResult {
  const status = input.subscriptionStatus ?? null;
  return {
    synced: input.synced ?? false,
    accessReady: input.accessReady ?? isAccessReady(status),
    planSlug: input.planSlug ?? null,
    subscriptionStatus: status,
    error: input.error ?? null,
    onboardingStatus: input.onboardingStatus ?? "pending_email_confirmation",
    customerEmail: input.customerEmail ?? null,
    confirmationEmailResent: input.confirmationEmailResent ?? false,
  };
}

async function syncCheckoutSession(sessionId?: string): Promise<SyncCheckoutResult> {
  if (!sessionId) return syncResult({ error: "Sessão não informada." });

  try {
    const session = await getCheckoutSession(sessionId);
    const subscriptionId = getSubscriptionIdFromSession(session);
    const embeddedSubscription = session.subscription && typeof session.subscription === "object" ? session.subscription : null;
    const subscription = subscriptionId ? await getStripeSubscription(subscriptionId) : embeddedSubscription;
    const priceId = normalize(subscription?.items?.data?.[0]?.price?.id);
    const planSlug = normalize(subscription?.metadata?.plan_slug)?.toLowerCase() ?? normalize(session?.metadata?.plan_slug)?.toLowerCase() ?? getPlanSlugFromPrice(priceId);
    const metadataUserId = normalize(session?.metadata?.user_id) ?? normalize(subscription?.metadata?.user_id);
    const customerId = getStripeId(subscription?.customer) ?? getCustomerIdFromSession(session);
    const customerEmail = normalizeEmail(session?.metadata?.email) ?? getCustomerEmailFromSession(session);
    const attribution = pickStripeAttribution(session, subscription);
    const supabase = await createClient();
    let confirmationEmailResent = false;

    if (!planSlug) return syncResult({ planSlug: null, error: "Plano não identificado pelo Stripe.", customerEmail, confirmationEmailResent });

    const admin = createSupabaseAdminClient() as any;
    const planResponse = await admin.from("plans").select("id, slug").eq("slug", planSlug).maybeSingle();
    const { data: plan } = planResponse;

    if (planResponse.error) console.error("[checkout.success.syncCheckoutSession] erro Supabase ao buscar plano", planResponse.error);
    if (!plan?.id) return syncResult({ planSlug, error: `Plano ${planSlug} não encontrado no banco.`, customerEmail, confirmationEmailResent });

    if (!subscription?.id) {
      console.error("[checkout.success.syncCheckoutSession] SESSION_SUBSCRIPTION_NULL", { session_id: sessionId, session_subscription: session?.subscription ?? null });
      if (customerEmail) confirmationEmailResent = await resendSignupConfirmation(supabase, customerEmail);
      return syncResult({ planSlug, error: null, customerEmail, confirmationEmailResent });
    }

    const profile = await findProfileForCheckout(admin, metadataUserId, customerEmail);
    const onboardingStatus = String(profile?.onboarding_status ?? "pending_email_confirmation");

    if (!profile?.id) {
      if (customerEmail) confirmationEmailResent = await resendSignupConfirmation(supabase, customerEmail);
      return syncResult({ planSlug, error: null, onboardingStatus: "pending_email_confirmation", customerEmail, confirmationEmailResent });
    }

    const status = mapStripeStatus(subscription.status ?? "incomplete");
    const currentPeriodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null;
    const now = new Date().toISOString();

    const payload = {
      user_id: profile.id,
      plan_id: plan.id,
      status,
      gateway: "stripe",
      stripe_customer_id: customerId,
      gateway_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      gateway_subscription_id: subscription.id,
      stripe_price_id: priceId,
      current_period_end: currentPeriodEnd,
      trial_ends_at: trialEndsAt,
      next_billing_at: isActiveSubscriptionStatus(status) ? currentPeriodEnd : null,
      auto_renew: !Boolean(subscription.cancel_at_period_end) && isActiveSubscriptionStatus(status),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      canceled_at: status === "canceled" ? now : null,
      ...attribution,
      last_webhook_event: "checkout.success_page_sync",
      updated_at: now,
    };

    const existingResponse = await admin.from("subscriptions").select("id").eq("user_id", profile.id).maybeSingle();
    const { data: existing } = existingResponse;

    if (existingResponse.error) console.error("[checkout.success.syncCheckoutSession] erro Supabase ao buscar assinatura local", existingResponse.error);

    const result = existing?.id
      ? await admin.from("subscriptions").update(payload).eq("id", existing.id).select()
      : await admin.from("subscriptions").insert(payload).select();

    if (result.error) {
      console.error("[checkout.success] Falha ao sincronizar assinatura", result.error);
      if (customerEmail) confirmationEmailResent = await resendSignupConfirmation(supabase, customerEmail);
      return syncResult({ planSlug, subscriptionStatus: status, error: null, onboardingStatus: "pending_email_confirmation", customerEmail, confirmationEmailResent });
    }

    const profileUpdateResponse = await admin
      .from("profiles")
      .update({ onboarding_step: "checkout_completed", updated_at: now })
      .eq("id", profile.id)
      .select("id,email,onboarding_status,onboarding_step");

    if (profileUpdateResponse.error) console.error("[checkout.success.syncCheckoutSession] erro Supabase ao atualizar profile", profileUpdateResponse.error);

    if (onboardingStatus === "pending_email_confirmation" && customerEmail) {
      confirmationEmailResent = await resendSignupConfirmation(supabase, customerEmail);
    }

    return syncResult({ synced: true, planSlug, subscriptionStatus: status, error: null, onboardingStatus, customerEmail, confirmationEmailResent });
  } catch (error) {
    console.error("[checkout.success] Erro inesperado", error);
    return syncResult({ error: error instanceof Error ? error.message : "Erro desconhecido." });
  }
}

export default async function CheckoutSucesso({ searchParams }: CheckoutSuccessProps) {
  const resolvedSearchParams = await searchParams;
  const sessionId = resolvedSearchParams?.session_id ?? null;
  const sync = await syncCheckoutSession(resolvedSearchParams?.session_id);
  const planName = planDisplayName(sync.planSlug);
  const firstSignupFlow = sync.onboardingStatus === "pending_email_confirmation";
  const accessReady = sync.accessReady;
  const purchaseEventEnabled = Boolean(sync.synced && accessReady && sync.planSlug && sessionId);
  const eyebrow = accessReady ? (firstSignupFlow ? "Pagamento aprovado" : `Onboarding ${planName}`) : "Pagamento em processamento";
  const title = accessReady
    ? firstSignupFlow
      ? "Parabéns! Seu Harmomus está quase pronto 🎉"
      : `Bem-vindo(a) ao Harmomus ${planName} 🎉`
    : "Sua assinatura está sendo confirmada";

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <MetaPurchaseEvent enabled={purchaseEventEnabled} planSlug={sync.planSlug} sessionId={sessionId} subscriptionStatus={sync.subscriptionStatus} />
      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-emerald-500/30 bg-zinc-900/90 p-8 shadow-2xl md:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">{eyebrow}</p>

        <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">{title}</h1>

        <p className="mt-4 text-zinc-300">
          {accessReady
            ? firstSignupFlow
              ? "Seu pagamento foi confirmado. Agora falta apenas confirmar seu e-mail para liberar o primeiro login e acessar sua conta."
              : "Sua assinatura foi sincronizada e os recursos do seu plano já estão liberados na sua conta."
            : "Recebemos seu retorno do checkout, mas o Stripe ainda não confirmou a assinatura como ativa. Assim que o pagamento ou período de teste for confirmado, o acesso será liberado automaticamente."}
        </p>

        {firstSignupFlow && accessReady ? (
          <div className="mt-6">
            <EmailConfirmationState variant="premium" email={sync.customerEmail ?? ""} allowEmailEdit allowResend sessionId={sessionId} />
          </div>
        ) : null}

        {!sync.synced && sync.error ? (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            Sincronização pendente: {sync.error}. Volte para Assinatura após alguns instantes.
          </div>
        ) : null}

        {!accessReady ? (
          <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
            Status atual: {sync.subscriptionStatus ?? "pendente"}. O sistema não libera Plus/Premium enquanto a assinatura não estiver ativa ou em teste ativo.
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5">
          <h2 className="text-lg font-semibold text-emerald-200">
            {accessReady ? (firstSignupFlow ? "Depois de confirmar o e-mail" : "Benefícios liberados agora") : "Próximos passos"}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>• Seu plano ficará vinculado à conta criada no cadastro.</li>
            <li>• O acesso pago só é liberado quando o Stripe confirmar status ativo ou teste ativo.</li>
            <li>• Seus dados de assinatura serão gerenciados com segurança pelo Stripe.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {firstSignupFlow && accessReady ? (
            <Link href="/login" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">
              Já confirmei, fazer login
            </Link>
          ) : accessReady ? (
            <>
              <a href={WHATSAPP_PREMIUM_URL} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Entrar no Grupo Premium</a>
              <Link href="/biblioteca" className="rounded-xl border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-100">Explorar catálogo</Link>
              <Link href="/assinatura" className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100">Gerenciar assinatura</Link>
            </>
          ) : (
            <>
              <Link href="/assinatura" className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100">Ver status da assinatura</Link>
              <Link href="/biblioteca" className="rounded-xl border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-100">Voltar ao catálogo</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
