"use client";

import { useMemo, useState, useTransition } from "react";

import type { HomePollResult } from "@/lib/data/home-polls";

interface HomePollSectionProps {
  initialPoll: HomePollResult;
}

function resolveLeader(poll: HomePollResult) {
  return [...poll.options].sort((a, b) => b.voteCount - a.voteCount)[0] ?? null;
}

export function HomePollSection({ initialPoll }: HomePollSectionProps) {
  const [poll, setPoll] = useState(initialPoll);
  const [selectedOptionId, setSelectedOptionId] = useState(initialPoll.userVoteOptionId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasVoted = Boolean(poll.userVoteOptionId);
  const leader = useMemo(() => resolveLeader(poll), [poll]);

  function vote() {
    if (!selectedOptionId || hasVoted || pending) return;

    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/home-polls/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollId: poll.id, optionId: selectedOptionId }),
      });

      const data = await response.json().catch(() => null);
      if (data?.poll) setPoll(data.poll);
      if (!response.ok || data?.error) {
        setMessage(data?.error ?? "Não foi possível registrar seu voto.");
        return;
      }
      setMessage("Voto registrado! Obrigado por ajudar a escolher o próximo kit.");
    });
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-fuchsia-300/30 bg-[radial-gradient(circle_at_15%_5%,rgba(34,211,238,0.25),transparent_28%),radial-gradient(circle_at_85%_10%,rgba(217,70,239,0.22),transparent_30%),linear-gradient(135deg,#07111f,#12091f_55%,#05070d)] p-5 shadow-[0_25px_90px_rgba(217,70,239,0.16)] md:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />

      <div className="relative grid gap-7 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <span className="inline-flex rounded-full border border-cyan-300/35 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100">
            {poll.eyebrow || "Enquete Premium"}
          </span>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-white md:text-5xl">
            {poll.title || poll.question}
          </h2>
          {poll.title ? <p className="mt-3 text-lg font-medium text-cyan-100">{poll.question}</p> : null}
          {poll.subtitle ? <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-200 md:text-base">{poll.subtitle}</p> : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Total de votos</p>
              <p className="mt-1 text-3xl font-bold text-white">{poll.totalVotes}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Liderando agora</p>
              <p className="mt-1 truncate text-lg font-semibold text-white">{leader ? leader.label : "Aguardando votos"}</p>
              {leader?.artist ? <p className="truncate text-xs text-cyan-100">{leader.artist}</p> : null}
            </div>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-white/15 bg-black/30 p-4 backdrop-blur-xl md:p-5">
          <div className="space-y-3">
            {poll.options.map((option, index) => {
              const selected = selectedOptionId === option.id;
              const votedHere = poll.userVoteOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => !hasVoted && setSelectedOptionId(option.id)}
                  disabled={hasVoted || pending}
                  className={`group relative w-full overflow-hidden rounded-2xl border p-4 text-left transition ${
                    votedHere
                      ? "border-cyan-200/80 bg-cyan-300/15"
                      : selected
                        ? "border-fuchsia-200/80 bg-fuchsia-300/12"
                        : "border-white/10 bg-white/[0.04] hover:border-cyan-200/50 hover:bg-white/[0.07]"
                  }`}
                >
                  <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-300/20 to-fuchsia-300/20 transition-all" style={{ width: `${option.percent}%` }} />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Opção {index + 1}</p>
                      <p className="mt-1 text-base font-semibold text-white md:text-lg">{option.label}</p>
                      {option.artist ? <p className="mt-0.5 text-sm text-zinc-300">{option.artist}</p> : null}
                      {option.description ? <p className="mt-2 text-xs leading-5 text-zinc-400">{option.description}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-2xl font-black text-white">{option.percent}%</p>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-400">{option.voteCount} votos</p>
                    </div>
                  </div>
                  {votedHere ? <p className="relative mt-3 text-xs font-semibold text-cyan-100">✓ Seu voto</p> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={vote}
              disabled={!selectedOptionId || hasVoted || pending}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_16px_45px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-50"
            >
              {hasVoted ? "Você já votou" : pending ? "Registrando..." : "Votar no próximo kit"}
            </button>
            <p className="text-xs leading-5 text-zinc-400">A votação ajuda a definir quais kits vocais entram primeiro no Harmomus.</p>
          </div>

          {message ? <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-zinc-100">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}
