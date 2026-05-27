"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PlanSlug = "free" | "plus" | "premium" | "ministry_10";

type PlanConfig = {
  slug: PlanSlug;
  label: string;
  price: string;
  cta: string;
  features: string[];
};

const PLAN_CONFIGS: PlanConfig[] = [
  {
    slug: "free",
    label: "Free",
    price: "Grátis",
    cta: "Criar conta grátis",
    features: [
      "✅ 3 acessos diários a kits",
      "✅ Apenas tom original",
      "✅ Player limitado",
      "❌ Criação de playlists",
      "✅ Comunidade aberta",
      "❌ Troca de tonalidade",
      "❌ Solicitação de novos kits",
      "❌ Solicitação de novos tons",
    ],
  },
  {
    slug: "plus",
    label: "Plus",
    price: "R$19/mês",
    cta: "Criar conta e assinar Plus",
    features: [
      "✅ Acesso ilimitado aos kits",
      "✅ Player completo",
      "✅ Apenas tom original",
      "✅ Catálogo completo",
      "✅ Criação de playlists",
      "✅ Comunidade aberta",
      "❌ Solicitação de novos kits",
      "❌ Solicitação de novos tons",
    ],
  },
  {
    slug: "premium",
    label: "Premium",
    price: "R$39/mês + 7 dias grátis",
    cta: "Criar conta e testar Premium grátis por 7 dias",
    features: [
      "✅ Acesso ilimitado aos kits",
      "✅ Todos os tons disponíveis",
      "✅ Criação de playlists",
      "✅ Solicitação de novos kits",
      "✅ Solicitação de novos tons",
      "✅ Conteúdos extras",
      "✅ Votações internas",
      "✅ Selo Premium Harmomus",
    ],
  },
  {
    slug: "ministry_10",
    label: "Ministerial",
    price: "A partir de R$397/mês",
    cta: "Criar conta e ver plano ministerial",
    features: [
      "✅ Acesso Premium para equipe",
      "✅ 10, 20 ou 40 integrantes",
      "✅ Responsável gerencia membros",
      "✅ Ideal para ministérios de louvor",
      "✅ Todos os tons e nipes",
      "✅ Solicitações centralizadas",
    ],
  },
];

function isPaidPlan(plan: PlanSlug) {
  return plan !== "free";
}

export function SignupPlanSelector({ initialPlan }: { initialPlan: PlanSlug }) {
  const [selectedPlan, setSelectedPlan] = useState<PlanSlug>(initialPlan);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const currentPlan = useMemo(
    () => PLAN_CONFIGS.find((plan) => plan.slug === selectedPlan) ?? PLAN_CONFIGS[0],
    [selectedPlan],
  );

  const loadingText = isPaidPlan(selectedPlan)
    ? "Abrindo checkout seguro..."
    : "Criando sua conta...";

  useEffect(() => {
    if (!isSubmitting) {
      setShowFallback(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowFallback(true);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [isSubmitting]);

  return (
    <>
      <input type="hidden" name="plan" value={selectedPlan} />

      <div className="md:col-span-2 mt-2">
        <h2 className="text-lg font-semibold text-white">Escolha seu plano</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {PLAN_CONFIGS.map((plan) => {
            const isSelected = selectedPlan === plan.slug;
            return (
              <button
                key={plan.slug}
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedPlan(plan.slug)}
                className={`rounded-xl border p-3 text-left transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? "border-cyan-300 bg-cyan-400/15 shadow-[0_0_25px_rgba(34,211,238,0.25)]"
                    : "border-white/20 bg-white/[0.03] hover:border-white/40"
                }`}
              >
                <p className="text-xs text-zinc-300">{plan.label}</p>
                <p className="mt-1 text-xs font-semibold text-white">{plan.price}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-white/15 bg-black/35 p-4 transition-all duration-300">
          <p className="text-base font-semibold text-white">{currentPlan.label}</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-200">
            {currentPlan.features.map((feature) => (
              <li key={`${currentPlan.slug}-${feature}`}>{feature}</li>
            ))}
          </ul>
        </div>
      </div>

      {isSubmitting ? (
        <div className="md:col-span-2 rounded-2xl border border-cyan-300/30 bg-gradient-to-r from-cyan-400/10 to-violet-500/10 p-4 text-sm text-cyan-50 shadow-[0_0_35px_rgba(34,211,238,0.2)]">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
            <div>
              <p className="font-semibold">{loadingText}</p>
              <p className="mt-1 text-xs text-cyan-100/75">
                Aguarde alguns segundos. Não feche esta página nem clique novamente.
              </p>
              {showFallback ? (
                <p className="mt-2 text-xs text-cyan-100">
                  Ainda processando com segurança. Se demorar mais, volte e tente novamente em instantes.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <button
        disabled={isSubmitting}
        onClick={() => setIsSubmitting(true)}
        className="h-12 w-full rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-cyan-400 to-violet-500 font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-80 md:col-span-2"
      >
        {isSubmitting ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loadingText}
          </span>
        ) : (
          currentPlan.cta
        )}
      </button>
    </>
  );
}
