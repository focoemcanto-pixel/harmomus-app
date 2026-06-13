"use client";

import Link from "next/link";
import { useState } from "react";

const CONFIRMATION_PHRASE = "EXCLUIR MINHA CONTA";

type ProfileAdvancedCardProps = {
  deletionScheduledFor?: string | null;
  hasBlockingSubscription?: boolean;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export function ProfileAdvancedCard({ deletionScheduledFor, hasBlockingSubscription = false }: ProfileAdvancedCardProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [scheduledFor, setScheduledFor] = useState<string | null>(deletionScheduledFor ?? null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const canConfirm = confirmation.trim() === CONFIRMATION_PHRASE;

  async function scheduleDeletion() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/profile/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível solicitar exclusão da conta.");
      setScheduledFor(data?.scheduledFor ?? null);
      setOpen(false);
      setConfirmation("");
      setMessage("Exclusão agendada com sucesso. Você pode cancelar antes da data final.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao solicitar exclusão da conta.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelDeletion() {
    try {
      setLoading(true);
      setMessage("");
      const response = await fetch("/api/profile/delete-account", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível cancelar a exclusão.");
      setScheduledFor(null);
      setMessage("Exclusão cancelada. Sua conta continuará ativa.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao cancelar exclusão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[2rem] border border-rose-300/20 bg-gradient-to-br from-rose-950/30 via-zinc-950/80 to-zinc-900/70 p-5 text-sm text-zinc-100 shadow-[0_0_70px_rgba(244,63,94,0.08)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Zona de perigo</p>
          <h2 className="mt-2 text-2xl font-black text-white">Excluir minha conta</h2>
          <p className="mt-2 max-w-2xl leading-6 text-zinc-300">
            Esta ação agenda a exclusão da sua conta em 7 dias. Durante esse período você ainda pode cancelar a solicitação.
          </p>
        </div>
        <Link href="/assinatura" className="inline-flex rounded-2xl border border-white/15 bg-white/10 px-5 py-3 font-black text-white transition hover:bg-white/15">
          Gerenciar assinatura
        </Link>
      </div>

      {scheduledFor ? (
        <div className="mt-5 rounded-2xl border border-yellow-300/25 bg-yellow-300/10 p-4 text-yellow-50">
          <p className="font-black">Exclusão agendada para {formatDate(scheduledFor)}</p>
          <p className="mt-1 text-yellow-50/85">Até essa data você pode cancelar a exclusão e manter sua conta ativa.</p>
          <button type="button" onClick={cancelDeletion} disabled={loading} className="mt-4 rounded-2xl bg-yellow-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-yellow-200 disabled:cursor-wait disabled:opacity-70">
            {loading ? "Cancelando..." : "Cancelar exclusão"}
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="font-semibold text-white">Ao excluir, serão removidos:</p>
          <div className="mt-3 grid gap-2 text-zinc-300 md:grid-cols-2">
            <span>• Perfil e dados pessoais</span>
            <span>• Playlists</span>
            <span>• Favoritos</span>
            <span>• Histórico de estudos</span>
            <span>• Sugestões de kits</span>
            <span>• Solicitações de tom</span>
          </div>
          {hasBlockingSubscription ? (
            <div className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-amber-50">
              <p className="font-black">Você possui uma assinatura ativa ou pendente.</p>
              <p className="mt-1 text-amber-50/85">Cancele ou regularize sua assinatura antes de solicitar a exclusão da conta.</p>
            </div>
          ) : null}
          <button type="button" onClick={() => setOpen(true)} disabled={hasBlockingSubscription} className="mt-4 rounded-2xl border border-rose-300/40 bg-rose-500/10 px-5 py-3 font-black text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50">
            Excluir conta
          </button>
        </div>
      )}

      {message ? <p className="mt-4 text-sm text-zinc-200">{message}</p> : null}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] border border-rose-300/25 bg-[#11131a] p-6 shadow-2xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Confirmação necessária</p>
            <h3 className="mt-2 text-2xl font-black text-white">Tem certeza?</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">
              Essa solicitação agenda a exclusão da conta em 7 dias. Para confirmar, digite exatamente:
            </p>
            <p className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-black text-rose-100">{CONFIRMATION_PHRASE}</p>
            <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white outline-none ring-rose-300/30 placeholder:text-zinc-500 focus:ring" placeholder="Digite a frase de confirmação" />
            <div className="mt-5 flex flex-col gap-3 md:flex-row md:justify-end">
              <button type="button" onClick={() => { setOpen(false); setConfirmation(""); }} className="rounded-2xl border border-white/15 px-5 py-3 font-black text-zinc-100 hover:bg-white/10">Cancelar</button>
              <button type="button" onClick={scheduleDeletion} disabled={!canConfirm || loading} className="rounded-2xl bg-rose-500 px-5 py-3 font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? "Agendando..." : "Confirmar exclusão"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
