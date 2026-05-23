import Link from "next/link";

import { getCheckoutSession } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { mapStripeStatus } from "@/lib/stripe/status";

const WHATSAPP_PREMIUM_URL = "https://chat.whatsapp.com/FNU6Xl5t6qD0VfGA2EQ0IW?mode=gi_t";

type CheckoutSuccessProps = {
  searchParams?: Promise<{ session_id?: string }> | { session_id?: string };
};

function getPlanSlugFromPrice(priceId: string | null) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return "premium";
  return null;
}

async function syncCheckoutSession(sessionId?: string) {
  if (!sessionId) return { synced: false, planSlug: null, error: "Sessão não informada." };

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return { synced: false, planSlug: null, error: "Usuário não autenticado." };

    const session = await getCheckoutSession(sessionId);
    const subscription = session.subscription && typeof session.subscription === "object" ? session.subscription : null;
    const priceId = subscription?.items?.data?.[0]?.price?.id ?? null;
    const planSlug = getPlanSlugFromPrice(priceId);

    if (!planSlug) return { synced: false, planSlug: null, error: "Plano não identificado pelo Price ID do Stripe." };

    const { data: plan } = await (supabase as any).from("plans").select("id, slug").eq("slug", planSlug).maybeSingle();
    if (!plan?.id) return { synced: false, planSlug, error: `Plano ${planSlug} não encontrado no banco.` };

    const status = mapStripeStatus(subscription?.status ?? "active");

    const payload = {
      user_id: user.id,
      plan_id: plan.id,
      status,
      gateway: "stripe",
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await (supabase as any)
      .from("subscriptions")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const result = existing?.id
      ? await (supabase as any).from("subscriptions").update(payload).eq("id", existing.id)
      : await (supabase as any).from("subscriptions").insert(payload);

    if (result.error) return { synced: false, planSlug, error: result.error.message };
    return { synced: true, planSlug, error: null };
  } catch (error) {
    return { synced: false, planSlug: null, error: error instanceof Error ? error.message : "Erro desconhecido." };
  }
}

export default async function CheckoutSucesso({ searchParams }: CheckoutSuccessProps) {
  const resolvedSearchParams = await searchParams;
  const sync = await syncCheckoutSession(resolvedSearchParams?.session_id);
  const planName = sync.planSlug === "plus" ? "Plus" : sync.planSlug === "premium" ? "Premium" : "Plus/Premium";

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-white">
      <div className="mx-auto mt-10 max-w-3xl rounded-3xl border border-emerald-500/30 bg-zinc-900/90 p-8 shadow-2xl md:p-10">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Onboarding {planName}</p>
        <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">Bem-vindo(a) ao Harmomus {planName} 🎉</h1>
        <p className="mt-4 text-zinc-300">
          {sync.synced
            ? "Sua assinatura foi sincronizada e os recursos do seu plano já estão liberados na sua conta."
            : "Seu pagamento foi confirmado no Stripe, mas a sincronização automática ainda precisa ser concluída."}
        </p>

        {!sync.synced ? (
          <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
            Sincronização pendente: {sync.error}. Volte para Assinatura após alguns instantes ou configure o webhook do Stripe.
          </div>
        ) : null}

        <div className="mt-8 rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5">
          <h2 className="text-lg font-semibold text-emerald-200">Benefícios liberados agora</h2>
          <ul className="mt-3 space-y-2 text-sm text-zinc-300">
            <li>• Acesso completo ao conteúdo do seu plano.</li>
            <li>• Playlists e funcionalidades premium disponíveis imediatamente.</li>
            <li>• Gerenciamento de cobrança direto pelo Stripe Portal.</li>
          </ul>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href={WHATSAPP_PREMIUM_URL} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-zinc-950">Entrar no Grupo Premium</a>
          <Link href="/biblioteca" className="rounded-xl border border-zinc-600 px-5 py-3 text-sm font-semibold text-zinc-100">Explorar catálogo</Link>
          <Link href="/assinatura" className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-100">Gerenciar assinatura</Link>
        </div>
      </div>
    </main>
  );
}
