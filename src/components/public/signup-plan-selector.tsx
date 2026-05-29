"use client";

import { Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

type PlanSlug = "free" | "plus" | "premium" | "ministry_10" | "ministry_20" | "ministry_40";

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
    label: "Ministerial 10",
    price: "R$397/mês",
    cta: "Criar conta e assinar plano 10 integrantes",
    features: [
      "✅ Até 10 integrantes",
      "✅ Acesso Premium para equipe",
      "✅ Gestão centralizada",
      "✅ Todos os tons e nipes",
      "✅ Solicitações centralizadas",
    ],
  },
  {
    slug: "ministry_20",
    label: "Ministerial 20",
    price: "R$697/mês",
    cta: "Criar conta e assinar plano 20 integrantes",
    features: [
      "✅ Até 20 integrantes",
      "✅ Acesso Premium para equipe",
      "✅ Gestão centralizada",
      "✅ Todos os tons e nipes",
      "✅ Ideal para equipes maiores",
    ],
  },
  {
    slug: "ministry_40",
    label: "Ministerial 40",
    price: "R$997/mês",
    cta: "Criar conta e assinar plano 40 integrantes",
    features: [
      "✅ Até 40 integrantes",
      "✅ Estrutura ministerial completa",
      "✅ Gestão avançada de equipe",
      "✅ Todos os tons e nipes",
      "✅ Suporte prioritário",
    ],
  },
];

function isPaidPlan(plan: PlanSlug) {
  return plan !== "free";
}

function isMinistryPlan(plan: PlanSlug) {
  return plan.startsWith("ministry_");
}

export function SignupPlanSelector({ initialPlan }: { initialPlan: PlanSlug }) {
  const [selectedPlan, setSelectedPlan] = useState<PlanSlug>(initialPlan);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);

  const currentPlan = useMemo(
    () => PLAN_CONFIGS.find((plan) => plan.slug === selectedPlan) ?? PLAN_CONFIGS[0],
    [selectedPlan],
  );

  const loadingText = isPaidPlan(selectedPlan)
    ? "Abrindo checkout seguro..."
    : "Criando sua conta...";

  return (
    <>
      <input type="hidden" name="plan" value={selectedPlan} />

      <div className="md:col-span-2 mt-2">
        <h2 className="text-lg font-semibold text-white">Escolha seu plano</h2>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {PLAN_CONFIGS.filter((plan) => !isMinistryPlan(plan.slug) || plan.slug === "ministry_10").map((plan) => {
            const isSelected = selectedPlan === plan.slug || (plan.slug === "ministry_10" && isMinistryPlan(selectedPlan));

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
                <p className="text-xs text-zinc-300">{plan.label === "Ministerial 10" ? "Ministerial" : plan.label}</p>
                <p className="mt-1 text-xs font-semibold text-white">
                  {plan.label === "Ministerial 10" ? "A partir de R$397/mês" : plan.price}
                </p>
              </button>
            );
          })}
        </div>

        {isMinistryPlan(selectedPlan) ? (
          <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4">
            <p className="text-sm font-semibold text-cyan-100">Escolha a quantidade de integrantes do ministério</p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {PLAN_CONFIGS.filter((plan) => isMinistryPlan(plan.slug)).map((plan) => {
                const active = selectedPlan === plan.slug;

                return (
                  <button
                    key={plan.slug}
                    type="button"
                    onClick={() => setSelectedPlan(plan.slug)}
                    className={`rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? "border-cyan-300 bg-cyan-400/15 shadow-[0_0_25px_rgba(34,211,238,0.2)]"
                        : "border-white/10 bg-black/20 hover:border-white/30"
                    }`}
                  >
                    <p className="text-base font-semibold text-white">{plan.label}</p>
                    <p className="mt-1 text-sm text-cyan-100">{plan.price}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

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
                Aguarde alguns segundos. Estamos preparando seu acesso com segurança.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <button
        ref={submitButtonRef}
        type={isPaidPlan(selectedPlan) ? "button" : "submit"}
        disabled={isSubmitting}
        onClick={() => {
          if (!isPaidPlan(selectedPlan)) return;

          setIsSubmitting(true);
          window.setTimeout(() => {
            submitButtonRef.current?.form?.requestSubmit();
          }, 40);
        }}
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
