"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, UserPlus } from "lucide-react";

import { PremiumPanel } from "@/components/ministerio/ministry-ui";

export function MinistryInviteCard({ canManage, remainingSeats }: { canManage: boolean; remainingSeats: number }) {
  const limitReached = remainingSeats <= 0;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "warning">("success");

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (limitReached || isPending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/ministerio/invite", {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
            "x-harmomus-action": "fetch",
          },
        });
        const data = await response.json().catch(() => ({}));
        setTone(response.ok && data?.ok !== false ? "success" : "warning");
        setMessage(data?.message || (response.ok ? "Convite processado." : "Não foi possível enviar o convite."));
        if (response.ok && data?.ok !== false) {
          formRef.current?.reset();
          router.refresh();
        }
      } catch {
        setTone("warning");
        setMessage("Falha de conexão ao enviar o convite. Tente novamente.");
      }
    });
  }

  return (
    <PremiumPanel id="convites">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Convites</p>
          <h2 className="mt-2 text-2xl font-semibold">Enviar convite Premium</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Convide integrantes pelo e-mail. Eles recebem acesso Premium Ministerial aos kits sem permissão para solicitar novas músicas ou tons.
          </p>
        </div>
        <div className="hidden rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100 sm:block"><Mail className="h-5 w-5" /></div>
      </div>

      {message ? (
        <div className={`mt-5 rounded-2xl border p-4 text-sm ${tone === "success" ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100" : "border-amber-300/25 bg-amber-400/10 text-amber-100"}`}>
          {message}
        </div>
      ) : null}

      {canManage ? (
        <form ref={formRef} onSubmit={submitInvite} action="/api/ministerio/invite" method="post" className="mt-6 space-y-3">
          <input
            name="name"
            required
            placeholder="Nome do integrante"
            className="h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white outline-none ring-cyan-300/30 placeholder:text-zinc-500 focus:ring"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="email@integrante.com"
            className="h-12 w-full rounded-2xl border border-white/15 bg-black/25 px-4 text-sm text-white outline-none ring-cyan-300/30 placeholder:text-zinc-500 focus:ring"
          />
          <button
            disabled={limitReached || isPending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-fuchsia-400 text-sm font-semibold text-slate-950 shadow-[0_18px_50px_rgba(34,211,238,0.18)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {isPending ? "Enviando convite..." : limitReached ? "Limite de vagas atingido" : "Enviar Convite Premium"}
          </button>
          <p className="text-xs text-zinc-500">Vagas livres agora: {Math.max(0, remainingSeats)}.</p>
        </form>
      ) : (
        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
          Apenas responsáveis e gestores do ministério podem cadastrar integrantes.
        </div>
      )}
    </PremiumPanel>
  );
}
