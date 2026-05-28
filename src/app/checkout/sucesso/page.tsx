import Link from "next/link";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCheckoutSession } from "@/lib/stripe/client";
import { mapStripeStatus } from "@/lib/stripe/status";

const WHATSAPP_PREMIUM_URL = "https://chat.whatsapp.com/FNU6Xl5t6qD0VfGA2EQ0IW?mode=gi_t";

type CheckoutSuccessProps = {
  searchParams?: Promise<{ session_id?: string }> | { session_id?: string };
};

type SyncCheckoutResult = {
  synced: boolean;
  planSlug: string | null;
  error: string | null;
  onboardingStatus: string | null;
  customerEmail: string | null;
  confirmationEmailResent: boolean;
};

function getPlanSlugFromPrice(priceId: string | null) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return "premium";
  if (priceId === process.env.STRIPE_MINISTRY_10_PRICE_ID) return "ministry_10";
  if (priceId === process.env.STRIPE_MINISTRY_20_PRICE_ID) return "ministry_20";
  if (priceId === process.env.STRIPE_MINISTRY_40_PRICE_ID) return "ministry_40";
  return null;
}

function getCustomerIdFromSession(session: any) {
  if (typeof session?.customer === "string") return session.customer;
  if (session?.customer?.id) return String(session.customer.id);
  return null;
}

function getCustomerEmailFromSession(session: any) {
  return String(session?.customer_details?.email ?? session?.customer_email ?? "").trim().toLowerCase() || null;
}

async function resendSignupConfirmation(supabase: any, email: string | null) {
  if (!email) return false;

  const base = process.env.NEXT_PUBLIC_APP_URL?.trim()?.replace(/\/$/, "") || null;
  const emailRedirectTo = base ? `${base}/auth/confirm?next=${encodeURIComponent("/login?confirmed=1")}` : undefined;

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

async function findUserIdByCustomerOrEmail(admin: any, customerId: string | null, email: string | null) {
  if (customerId) {
    const { data: byCustomer } = await admin
      .from("subscriptions")
      .select("user_id")
      .or(`stripe_customer_id.eq.${customerId},gateway_customer_id.eq.${customerId}`)
      .maybeSingle();

    if (byCustomer?.user_id) return byCustomer.user_id as string;
  }

  if (email) {
    const { data: byEmail } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (byEmail?.id) return byEmail.id as string;
  }

  return null;
}

async function syncCheckoutSession(sessionId?: string): Promise<SyncCheckoutResult> {
  if (!sessionId) {
    return { synced: false, planSlug: null, error: "Sessão não informada.", onboardingStatus: "pending_email_confirmation", customerEmail: null, confirmationEmailResent: false };
  }

  try {
    const session = await getCheckoutSession(sessionId);
    const subscription = session.subscription && typeof session.subscription === "object" ? session.subscription : null;
    const priceId = subscription?.items?.data?.[0]?.price?.id ?? null;
    const planSlug = getPlanSlugFromPrice(priceId);
    const customerId = getCustomerIdFromSession(session);
    const customerEmail = getCustomerEmailFromSession(session);

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const loggedUserId = auth.user?.id ?? null;
    let confirmationEmailResent = false;

    if (!planSlug) {
      return { synced: false, planSlug: null, error: "Plano não identificado pelo Price ID do Stripe.", onboardingStatus: "pending_email_confirmation", customerEmail, confirmationEmailResent };
    }

    const admin = createSupabaseAdminClient() as any;
    const { data: plan } = await admin.from("plans").select("id, slug").eq("slug", planSlug).maybeSingle();

    if (!plan?.id) {
      return { synced: false, planSlug, error: `Plano ${planSlug} não encontrado no banco.`, onboardingStatus: "pending_email_confirmation", customerEmail, confirmationEmailResent };
    }

    const userId = loggedUserId ?? (await findUserIdByCustomerOrEmail(admin, customerId, customerEmail));

    if (!userId) {
      return { synced: false, planSlug, error: "Usuário não localizado para sincronizar assinatura.", onboardingStatus: "pending_email_confirmation", customerEmail, confirmationEmailResent };
    }

    const status = mapStripeStatus(subscription?.status ?? "active");
    const payload = {
      user_id: userId,
      plan_id: plan.id,
      status,
      gateway: "stripe",
      stripe_customer_id: customerId,
      gateway_customer_id: customerId,
      stripe_subscription_id: subscription?.id ?? null,
      gateway_subscription_id: subscription?.id ?? null,
      stripe_price_id: priceId,
      current_period_end: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      trial_ends_at: subscription?.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      next_billing_at: subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      last_webhook_event: "checkout.success_page_sync",
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = existing?.id
      ? await admin.from("subscriptions").update(payload).eq("id", existing.id)
      : await admin.from("subscriptions").insert(payload);

    if (result.error) {
      return { synced: false, planSlug, error: result.error.message, onboardingStatus: "pending_email_confirmation", customerEmail, confirmationEmailResent };
    }

    await admin
      .from("profiles")
      .update({ onboarding_step: "checkout_completed", updated_at: new Date().toISOString() })
      .eq("id", userId);

    const { data: profile } = await admin
      .from("profiles")
      .select("onboarding_status")
      .eq("id", userId)
      .maybeSingle();

    const onboardingStatus = String(profile?.onboarding_status ?? "pending_email_confirmation");
    if (onboardingStatus === "pending_email_confirmation" && customerEmail) {
      confirmationEmailResent = await resendSignupConfirmation(supabase, customerEmail);
    }

    return {
      synced: true,
      planSlug,
      error: null,
      onboardingStatus,
      customerEmail,
      confirmationEmailResent,
    };
  } catch (error) {
    return {
      synced: false,
      planSlug: null,
      error: error instanceof Error ? error.message : "Erro desconhecido.",
      onboardingStatus: "pending_email_confirmation",
      customerEmail: null,
      confirmationEmailResent: false,
    };
  }
}

export default async function CheckoutSucesso({ searchParams }: CheckoutSuccessProps) {
  const resolvedSearchParams = await searchParams;
  const sync = await syncCheckoutSession(resolvedSearchParams?.session_id);
  const planName = sync.planSlug === "plus" ? "Plus" : sync.planSlug === "premium" ? "Premium" : "Plus/Premium";
  const firstSignupFlow = sync.onboardingStatus === "pending_email_confirmation";

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-emerald-500/30 bg-zinc-900/90 p-8 shadow-2xl md:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
          {firstSignupFlow ? "Pagamento aprovado" : `Onboarding ${planName}`}
        </p>

        <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
          {firstSignupFlow ? "Parabéns! Seu Harmomus está quase pronto 🎉" : `Bem-vindo(a) ao Harmomus ${planName} 🎉`}
        </h1>

        <p className="mt-4 text-zinc-300">
          {firstSignupFlow
            ? "Seu pagamento foi confirmado. Agora falta apenas confirmar seu e-mail para liberar o primeiro login e acessar sua conta premium."
            : sync.synced
              ? "Sua assinatura foi sincronizada e os recursos do seu plano já estão liberados na sua conta."
              : "Seu pagamento foi confirmado no Stripe, mas a sincronização automática ainda precisa ser concluída."}
        </p>

        {firstSignupFlow ? (
          <div className="mt-6 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-5 text-sm text-cyan-50">
            <h2 className="text-base font-semibold text-cyan-100">Confirme seu e-mail para acessar</h2>
            <p className="mt-2 text-cyan-50/90">
              Reenviamos seu e-mail de confirmação para {sync.customerEmail ? <strong>{sync.customerEmail}</strong> : "o e-mail usado no cadastro"}. Abra sua caixa de entrada, clique em confirmar e-mail e depois faça seu primeiro login.
            </p>
            <p className="mt-3 text-xs text-cyan-100/70">
              Verifique também spam, promoções ou lixo eletrônico se não encontrar a mensagem em alguns minutos.
            </p>
          </div>
        ) : null}

        {!sync.synced && !firstSignupFlow ? (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            Sincronização pendente: {sync.error}. Volte para Assinatura após alguns instantes ou configure o webhook do Stripe.
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5">
          <h2 className="text-lg font-semibold text-emerald-200">
            {firstSignupFlow ? "Depois de confirmar o e-mail" : "Benefícios liberados agora"}
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>• Seu plano ficará vinculado à conta criada no cadastro.</li>
            <li>• Após o primeiro login, você poderá acessar os kits liberados para seu plano.</li>
            <li>• Seus dados de assinatura serão gerenciados com segurança pelo Stripe.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {firstSignupFlow ? (
            <Link href="/login" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">
              Já confirmei, fazer login
            </Link>
          ) : (
            <>
              <a href={WHATSAPP_PREMIUM_URL} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Entrar no Grupo Premium</a>
              <Link href="/biblioteca" className="rounded-xl border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-100">Explorar catálogo</Link>
              <Link href="/assinatura" className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100">Gerenciar assinatura</Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
