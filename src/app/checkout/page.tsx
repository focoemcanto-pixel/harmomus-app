import Link from "next/link";
import { redirect } from "next/navigation";

import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPlans } from "@/lib/data/plans";

const PAID_PLAN_SLUGS = new Set(["plus", "premium", "ministry_10", "ministry_20", "ministry_40"]);
const ASAAS_TESTER_EMAILS = new Set(["markuezemarquinhos@hotmail.com"]);
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

type CheckoutPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PaymentOption = {
  title: string;
  description: string;
  button: string;
  href: string;
  badge: string;
};

function getStringParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];
  return typeof value === "string" ? value : undefined;
}

function buildHref(path: string, planSlug: string, params: Record<string, string | string[] | undefined> | undefined, extra?: Record<string, string>) {
  const query = new URLSearchParams({ plan: planSlug, ...extra });
  for (const key of ATTRIBUTION_KEYS) {
    const value = getStringParam(params, key);
    if (value) query.set(key, value);
  }
  return `${path}?${query.toString()}`;
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const [params, plans, user] = await Promise.all([searchParams, getPlans(), getCurrentUser()]);
  const selectedPlan = String(getStringParam(params, "plan") ?? "premium").trim().toLowerCase();
  const plan = plans.find((item) => item.slug.toLowerCase() === selectedPlan && PAID_PLAN_SLUGS.has(item.slug));

  const planSlug = plan?.slug ?? "premium";
  const planName = plan?.name ?? "Premium";
  const price = typeof plan?.price_cents === "number"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: plan.currency || "BRL" }).format(plan.price_cents / 100)
    : null;

  const email = user?.email?.trim().toLowerCase();
  if (!email || !ASAAS_TESTER_EMAILS.has(email)) {
    redirect(buildHref("/api/billing/checkout", planSlug, params));
  }

  const options: PaymentOption[] = [
    {
      title: "Cartão",
      description: "Cartão de crédito recorrente.",
      button: "Continuar com Cartão",
      href: buildHref("/api/billing/checkout", planSlug, params),
      badge: "Stripe",
    },
    {
      title: "Pix",
      description: "Pagamento via Pix.",
      button: "Continuar com Pix",
      href: buildHref("/api/billing/checkout/asaas", planSlug, params, { method: "pix" }),
      badge: "Asaas",
    },
    {
      title: "Boleto",
      description: "Boleto mensal recorrente.",
      button: "Continuar com Boleto",
      href: buildHref("/api/billing/checkout/asaas", planSlug, params, { method: "boleto" }),
      badge: "Asaas",
    },
  ];

  return (
    <PublicAppShell>
      <main className="min-h-screen bg-gradient-to-b from-[#020617] via-[#060b1a] to-[#09031a] px-4 pb-12 pt-24 text-white md:px-8 md:pt-28">
        <section className="mx-auto max-w-5xl">
          <div className="rounded-3xl border border-white/15 bg-gradient-to-br from-[#171327] to-[#0b0d18] p-6 shadow-[0_25px_90px_rgba(34,211,238,0.18)] md:p-10">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Checkout Harmomus</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Escolha a forma de pagamento</h1>
            <p className="mt-4 max-w-3xl text-sm text-zinc-200 md:text-base">
              Plano selecionado: <strong className="text-white">{planName}</strong>{price ? ` — ${price}/mês` : ""}. O acesso será liberado assim que o gateway confirmar o pagamento.
            </p>
            {!plan ? (
              <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                O plano informado não foi encontrado. Mantivemos Premium como opção padrão para você continuar com segurança.
              </p>
            ) : null}
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {options.map((option) => (
              <article key={option.title} className="flex min-h-[260px] flex-col rounded-3xl border border-white/15 bg-white/[0.05] p-6 shadow-[0_18px_60px_rgba(15,23,42,0.35)]">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-semibold">{option.title}</h2>
                  <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">{option.badge}</span>
                </div>
                <p className="mt-4 flex-1 text-sm leading-6 text-zinc-200">{option.description}</p>
                <a href={option.href} className="mt-6 rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:opacity-90">
                  {option.button}
                </a>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <Link href={`/assinar?plan=${encodeURIComponent(planSlug)}`} className="rounded-xl border border-white/15 px-4 py-3 text-zinc-100 hover:bg-white/10">Voltar aos planos</Link>
            <Link href="/assinatura" className="rounded-xl border border-white/15 px-4 py-3 text-zinc-100 hover:bg-white/10">Ver minha assinatura</Link>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
