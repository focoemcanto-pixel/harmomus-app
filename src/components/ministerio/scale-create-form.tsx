"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

type Option = { id: string; label: string };

type Props = {
  teams: Option[];
  members: Option[];
  initialError?: string;
};

export function ScaleCreateForm({ teams, members, initialError }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(initialError || null);
  const busy = saving || pending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (!name) {
      setMessage("Informe o nome da escala.");
      return;
    }
    setSaving(true);
    setMessage("Salvando escala...");
    try {
      const response = await fetch("/api/ministerio/repertorios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          eventDate: form.get("event_date"),
          teamTemplateId: form.get("team_template_id"),
          coordinatorMemberId: form.get("coordinator_member_id"),
          description: form.get("description"),
          generalNotes: form.get("general_notes"),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.scale?.id) throw new Error(payload?.error || "Não foi possível criar a escala.");
      setMessage("Escala criada. Abrindo...");
      const href = `/ministerio/repertorios/${payload.scale.id}`;
      router.prefetch(href);
      startTransition(() => {
        router.push(href);
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar escala.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
      {message ? <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}
      <label className="block"><span className="text-sm font-semibold text-zinc-200">Nome da escala</span><input name="name" required maxLength={120} placeholder="Ex.: Culto Domingo Manhã" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
      <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Data do culto/evento</span><input type="date" name="event_date" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50" /></label>
      <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Equipe/template</span><select name="team_template_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Sem equipe pronta</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.label}</option>)}</select></label>
      <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Coordenador vocal</span><select name="coordinator_member_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50"><option value="">Usar coordenador do template ou definir depois</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select></label>
      <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Descrição</span><textarea name="description" rows={3} maxLength={500} placeholder="Ex.: Louvor da manhã, ensaio quinta-feira às 19h." className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
      <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Observação geral da escala</span><textarea name="general_notes" rows={3} maxLength={700} placeholder="Ex.: Coordenador deve revisar entradas e liberar estudo até sexta." className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-5"><Link href="/ministerio/repertorios" className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/10">Cancelar</Link><button disabled={busy} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{busy ? "Salvando escala..." : "Salvar escala"}</button></div>
    </form>
  );
}
