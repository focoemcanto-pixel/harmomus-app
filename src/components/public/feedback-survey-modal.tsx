"use client";

import { Check, MessageSquareText, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FEEDBACK_NEEDS } from "@/lib/data/feedback-survey";

type Props = {
  enabled: boolean;
  surveyKey: string;
};

async function send(action: string, surveyKey: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/feedback/survey", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, surveyKey, ...payload }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(json?.error || "Não foi possível salvar sua resposta.");
  return json;
}

export function FeedbackSurveyModal({ enabled, surveyKey }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rating, setRating] = useState<number | null>(null);
  const [primaryNeed, setPrimaryNeed] = useState("");
  const [songRequest, setSongRequest] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const selectedNeed = useMemo(() => FEEDBACK_NEEDS.find((item) => item.value === primaryNeed), [primaryNeed]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(async () => {
      try {
        const result = await send("impression", surveyKey);
        if (!result?.suppressed) setOpen(true);
      } catch {
        // Feedback nunca deve bloquear a experiência principal.
      }
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [enabled, surveyKey]);

  async function dismiss() {
    if (busy) return;
    setOpen(false);
    try {
      await send("dismiss", surveyKey);
    } catch {
      // Falha silenciosa: não interromper o usuário.
    }
  }

  function continueToDetails() {
    if (!rating) {
      setError("Escolha uma nota para continuar.");
      return;
    }
    setError("");
    setStep(2);
  }

  async function submit() {
    if (!rating || !primaryNeed) {
      setError("Escolha a opção que mais faria diferença para você.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await send("submit", surveyKey, { rating, primaryNeed, songRequest, comment });
      setStep(3);
      window.setTimeout(() => setOpen(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar sua resposta.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Pesquisa de experiência Harmomus">
      <div className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#090a11] shadow-[0_30px_100px_rgba(0,0,0,0.65)]">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.20),transparent_48%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.13),transparent_42%)]" />
        <button type="button" onClick={dismiss} className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/30 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Responder depois">
          <X size={18} />
        </button>

        <div className="relative p-5 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200">
              <MessageSquareText size={20} />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300">Sua experiência importa</p>
              <p className="mt-1 text-xs text-zinc-500">Leva menos de 15 segundos.</p>
            </div>
          </div>

          {step === 1 ? (
            <div className="mt-7">
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Como está sendo sua experiência com o Harmomus?</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Sua resposta ajuda a decidir o que entra primeiro nas próximas melhorias.</p>

              <div className="mt-6 grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button key={value} type="button" onClick={() => { setRating(value); setError(""); }} className={`rounded-2xl border px-2 py-4 text-lg font-semibold transition ${rating === value ? "border-violet-300/60 bg-violet-500/20 text-white shadow-[0_0_30px_rgba(139,92,246,0.16)]" : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/[0.06]"}`}>
                    {value}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-zinc-600"><span>Precisa melhorar</span><span>Excelente</span></div>

              {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
              <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button type="button" onClick={dismiss} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white">Agora não</button>
                <button type="button" onClick={continueToDetails} className="rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110">Continuar</button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mt-7">
              <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">O que mais faria o Harmomus ser útil para você hoje?</h2>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {FEEDBACK_NEEDS.map((item) => (
                  <button key={item.value} type="button" onClick={() => { setPrimaryNeed(item.value); setError(""); }} className={`flex min-h-14 items-center rounded-2xl border px-4 py-3 text-left text-sm transition ${primaryNeed === item.value ? "border-cyan-300/45 bg-cyan-500/10 text-cyan-50" : "border-white/10 bg-white/[0.025] text-zinc-300 hover:bg-white/[0.05]"}`}>
                    <span className={`mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${primaryNeed === item.value ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-zinc-600"}`}>{primaryNeed === item.value ? <Check size={13} /> : null}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              {primaryNeed === "catalog" ? (
                <label className="mt-5 block text-sm text-zinc-300">
                  Qual música você gostaria de encontrar no Harmomus?
                  <input value={songRequest} onChange={(event) => setSongRequest(event.target.value)} maxLength={160} placeholder="Nome da música ou artista" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40" />
                </label>
              ) : null}

              <label className="mt-5 block text-sm text-zinc-300">
                Quer contar mais alguma coisa? <span className="text-zinc-600">Opcional</span>
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={600} rows={3} placeholder={selectedNeed ? `Algo sobre “${selectedNeed.label}” ou outra sugestão...` : "Escreva sua sugestão..."} className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-violet-400/40" />
              </label>

              {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => setStep(1)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white">Voltar</button>
                <button type="button" onClick={submit} disabled={busy} className="rounded-2xl bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{busy ? "Enviando..." : "Enviar resposta"}</button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="py-10 text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-300/30 bg-emerald-500/10 text-emerald-200"><Check size={28} /></span>
              <h2 className="mt-5 text-2xl font-semibold text-white">Obrigado por ajudar a construir o Harmomus.</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">Sua resposta já entrou no nosso painel de prioridades.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
