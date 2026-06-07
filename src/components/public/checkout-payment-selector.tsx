"use client";

import { useMemo, useRef, useState } from "react";

import { AsaasBillingForm } from "@/components/public/asaas-billing-form";

type PaymentMethod = "card" | "pix" | "boleto";

type PaymentOption = {
  id: PaymentMethod;
  title: string;
  label: string;
  eyebrow: string;
  description: string;
  href: string;
  badge: string;
  bullets: string[];
};

type CheckoutPaymentSelectorProps = {
  planName: string;
  monthlyPrice: string;
  options: PaymentOption[];
};

const METHOD_SUMMARY: Record<PaymentMethod, { note: string; highlight: string }> = {
  card: {
    note: "Você começa com 7 dias grátis. Depois disso, a cobrança mensal acontece automaticamente no cartão.",
    highlight: "7 dias grátis",
  },
  pix: {
    note: "A cobrança Pix será gerada pelo Asaas e o acesso será liberado após a confirmação do pagamento.",
    highlight: "Pagamento instantâneo",
  },
  boleto: {
    note: "O boleto será gerado pelo Asaas e o acesso será liberado após a compensação bancária.",
    highlight: "Pagamento por boleto",
  },
};

const primaryButtonClass = "mt-6 block rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-4 text-center text-sm font-bold text-slate-950 transition hover:opacity-90";
const mobileButtonClass = "shrink-0 rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-bold text-slate-950";

export function CheckoutPaymentSelector({ planName, monthlyPrice, options }: CheckoutPaymentSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("card");
  const summaryRef = useRef<HTMLElement>(null);
  const selectedOption = useMemo(() => options.find((option) => option.id === selectedMethod) ?? options[0], [options, selectedMethod]);
  const selectedSummary = METHOD_SUMMARY[selectedOption.id];
  const isAsaasMethod = selectedOption.id === "pix" || selectedOption.id === "boleto";
  const todayAmount = selectedOption.id === "card" ? "R$ 0,00" : monthlyPrice;

  const selectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);
    if (method === "pix" || method === "boleto") return;
    window.setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  return (
    <>
      <div className="mt-8 grid gap-6 pb-28 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] lg:pb-0">
        <section className="rounded-[2rem] border border-white/12 bg-white/[0.04] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.35)] backdrop-blur md:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Forma de pagamento</p>
              <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Escolha como deseja assinar</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Cartão tem teste grátis. Pix e boleto liberam o acesso após confirmação do pagamento.</p>
            </div>
          </div>

          <div className="space-y-3">
            {options.map((option) => {
              const isSelected = option.id === selectedMethod;
              return (
                <button key={option.id} type="button" onClick={() => selectMethod(option.id)} className={`w-full rounded-3xl border p-4 text-left transition md:p-5 ${isSelected ? "border-cyan-300/70 bg-cyan-300/[0.08] shadow-[0_18px_55px_rgba(34,211,238,0.14)]" : "border-white/12 bg-slate-950/35 hover:border-white/25 hover:bg-white/[0.06]"}`}>
                  <div className="flex items-start gap-4">
                    <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-cyan-200" : "border-white/30"}`}>
                      {isSelected ? <span className="h-2.5 w-2.5 rounded-full bg-cyan-200" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-semibold text-white">{option.title}</h3>
                        {option.id === "card" ? <span className="rounded-full bg-cyan-300 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-950">Mais escolhido</span> : null}
                        <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">{option.badge}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-cyan-100">{option.eyebrow}</p>
                      <p className="mt-2 text-sm leading-6 text-zinc-300">{option.description}</p>
                      <div className="mt-3 grid gap-2 text-sm text-zinc-200 md:grid-cols-2">
                        {option.bullets.map((bullet) => <span key={bullet} className="flex items-center gap-2"><span className="text-cyan-200">✓</span>{bullet}</span>)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside ref={summaryRef} className="scroll-mt-28 rounded-[2rem] border border-white/12 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-6 shadow-[0_24px_80px_rgba(15,23,42,0.45)] backdrop-blur lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">Resumo</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Harmomus {planName}</h2>
          <p className="mt-2 text-sm text-zinc-300">Assinatura mensal para estudar kits vocais com organização e praticidade.</p>

          <div className="mt-6 rounded-2xl border border-white/12 bg-slate-950/35 p-4">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-sm text-zinc-400">Plano mensal</p><p className="mt-1 text-3xl font-semibold text-white">{monthlyPrice}</p></div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-cyan-100">{selectedSummary.highlight}</span>
            </div>
          </div>

          <div className="mt-6 space-y-3 text-sm text-zinc-200">
            {["Todos os kits vocais Premium", "Playbacks, guias e vozes separadas", "Novos kits adicionados regularmente", "Acesso em celular, tablet e computador", "Cancelamento a qualquer momento"].map((item) => <p key={item} className="flex gap-2"><span className="text-cyan-200">✓</span>{item}</p>)}
          </div>

          <div className="mt-6 border-t border-white/12 pt-5">
            <div className="flex items-center justify-between text-sm text-zinc-300"><span>Você paga hoje</span><strong className="text-2xl text-white">{todayAmount}</strong></div>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{selectedSummary.note}</p>
          </div>

          {isAsaasMethod ? (
            <AsaasBillingForm href={selectedOption.href} className={primaryButtonClass}>Continuar para pagamento</AsaasBillingForm>
          ) : (
            <a href={selectedOption.href} className={primaryButtonClass}>Continuar para pagamento</a>
          )}

          <p className="mt-4 text-center text-xs leading-5 text-zinc-500">Ao continuar, você será direcionado para {selectedOption.badge}. Pix e boleto são processados pelo Asaas.</p>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 px-4 py-3 shadow-[0_-18px_50px_rgba(0,0,0,0.45)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{selectedOption.label} selecionado</p><p className="truncate text-xs text-zinc-400">Hoje: {todayAmount}</p></div>
          {isAsaasMethod ? null : <a href={selectedOption.href} className={mobileButtonClass}>Continuar</a>}
        </div>
      </div>
    </>
  );
}
