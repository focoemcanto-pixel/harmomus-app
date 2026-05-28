// patched robust sync version
import Link from "next/link";

import { EmailConfirmationState } from "@/components/auth/email-confirmation-state";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCheckoutSession } from "@/lib/stripe/client";
import { mapStripeStatus } from "@/lib/stripe/status";

const WHATSAPP_PREMIUM_URL = "https://chat.whatsapp.com/FNU6Xl5t6qD0VfGA2EQ0IW?mode=gi_t";

function normalize(value: unknown) {
  return String(value ?? "").trim() || null;
}

function getStripeMetadata(session: any, subscription: any) {
  return {
    userId:
      normalize(subscription?.metadata?.user_id) ??
      normalize(session?.metadata?.user_id),
    planSlug:
      normalize(subscription?.metadata?.plan_slug)?.toLowerCase() ??
      normalize(session?.metadata?.plan_slug)?.toLowerCase(),
  };
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

async function syncCheckoutSession(sessionId?: string) {
  if (!sessionId) {
    return {
      synced: false,
      planSlug: null,
      error: "Sessão não informada.",
      onboardingStatus: "pending_email_confirmation",
      customerEmail: null,
      confirmationEmailResent: false,
    };
  }

  try {
    const session = await getCheckoutSession(sessionId);
    const subscription =
      session.subscription && typeof session.subscription === "object"
        ? session.subscription
        : null;

    const metadata = getStripeMetadata(session, subscription);

    const priceId = subscription?.items?.data?.[0]?.price?.id ?? null;

    const planSlug =
      metadata.planSlug ?? getPlanSlugFromPrice(priceId);

    const customerId =
      typeof session?.customer === "string"
        ? session.customer
        : session?.customer?.id ?? null;

    const customerEmail =
      String(
        session?.customer_details?.email ??
          session?.customer_email ??
          "",
      )
        .trim()
        .toLowerCase() || null;

    if (!planSlug) {
      return {
        synced: false,
        planSlug: null,
        error: "Plano não identificado no Stripe.",
        onboardingStatus: "pending_email_confirmation",
        customerEmail,
        confirmationEmailResent: false,
      };
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();

    const admin = createSupabaseAdminClient() as any;

    const userId = metadata.userId ?? auth.user?.id ?? null;

    if (!userId) {
      return {
        synced: false,
        planSlug,
        error: "Usuário não localizado pelos metadados Stripe.",
        onboardingStatus: "pending_email_confirmation",
        customerEmail,
        confirmationEmailResent: false,
      };
    }

    const { data: plan } = await admin
      .from("plans")
      .select("id")
      .eq("slug", planSlug)
      .maybeSingle();

    if (!plan?.id) {
      return {
        synced: false,
        planSlug,
        error: "Plano não encontrado no banco.",
        onboardingStatus: "pending_email_confirmation",
        customerEmail,
        confirmationEmailResent: false,
      };
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
      current_period_end: subscription?.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      next_billing_at: subscription?.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      auto_renew: !Boolean(subscription?.cancel_at_period_end),
      last_webhook_event: "checkout.success_page_sync",
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    const result = existing?.id
      ? await admin
          .from("subscriptions")
          .update(payload)
          .eq("id", existing.id)
      : await admin.from("subscriptions").insert(payload);

    if (result.error) {
      return {
        synced: false,
        planSlug,
        error: result.error.message,
        onboardingStatus: "pending_email_confirmation",
        customerEmail,
        confirmationEmailResent: false,
      };
    }

    return {
      synced: true,
      planSlug,
      error: null,
      onboardingStatus: "active",
      customerEmail,
      confirmationEmailResent: false,
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

export default async function CheckoutSucesso({ searchParams }: any) {
  const resolvedSearchParams = await searchParams;
  const sync = await syncCheckoutSession(
    resolvedSearchParams?.session_id,
  );

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-emerald-500/30 bg-zinc-900/90 p-8 shadow-2xl md:p-10">
        <h1 className="text-4xl font-bold">
          {sync.synced
            ? "Assinatura sincronizada com sucesso 🎉"
            : "Pagamento recebido"}
        </h1>

        <p className="mt-4 text-zinc-300">
          {sync.synced
            ? "Seu plano premium já está ativo no Harmomus."
            : sync.error}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={WHATSAPP_PREMIUM_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950"
          >
            Entrar no Grupo Premium
          </a>

          <Link
            href="/biblioteca"
            className="rounded-xl border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-100"
          >
            Explorar catálogo
          </Link>

          <Link
            href="/assinatura"
            className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100"
          >
            Gerenciar assinatura
          </Link>
        </div>
      </div>
    </main>
  );
}
