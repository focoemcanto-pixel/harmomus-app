"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2 } from "lucide-react";

type TeamOption = { id: string; name: string };

export function CalendarScaleForm({ teams }: { teams: TeamOption[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const busy = saving || isPending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("Programando escalas...");
    try {
      const response = await fetch("/api/ministerio/repertorios/calendar-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titlePrefix: form.get("titlePrefix"),
          startDate: form.get("startDate"),
          occurrences: Number(form.get("occurrences") || 4),
          frequency: form.get("frequency"),
          teamTemplateId: form.get("teamTemplateId"),
          description: form.get("description"),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível programar escalas.");
      setMessage(`${payload?.scales?.length ?? 0} escalas programadas. Abrindo lista...`);
      startTransition(() => {
        router.push("/ministerio/repertorios");
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao programar escalas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-[2rem] border border-white/10 bg-black/20 p-5 md:p-6">
      {message ? <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}
      <label className="block"><span className="text-sm font-semibold text-zinc-200">Nome base</span><input name="titlePrefix" defaultValue="Culto Domingo" required className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className="text-sm font-semibold text-zinc-200">Data inicial</span><input type="date" name="startDate" required className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label><label><span className="text-sm font-semibold text-zinc-200">Quantidade</span><input type="number" min={1} max={24} name="occurrences" defaultValue={4} required className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label><span className="text-sm font-semibold text-zinc-200">Frequência</span><select name="frequency" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option></select></label><label><span className="text-sm font-semibold text-zinc-200">Equipe/template</span><select name="teamTemplateId" required className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50"><option value="">Selecione uma equipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
      <label className="mt-5 block"><span className="text-sm font-semibold text-zinc-200">Observação para todas</span><textarea name="description" rows={3} maxLength={500} placeholder="Ex.: montar repertório durante a semana" className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-cyan-300/50" /></label>
      <button disabled={busy || !teams.length} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}{busy ? "Programando..." : "Programar escalas"}</button>
    </form>
  );
}
