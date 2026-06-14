"use client";

import { useMemo, useState } from "react";
import { Save, Trash2, UserPlus } from "lucide-react";

type Member = { id: string; invited_name: string | null; invited_email: string | null; status?: string | null };
type Assignment = { id: string; member_id: string; assigned_voice: string | null; notes: string | null };
type Props = { repertoireId: string; members: Member[]; initialAssignments: Assignment[] };
const VOICES = [["", "Definir por música"], ["lead", "Lead"], ["tenor", "Tenor"], ["contralto", "Contralto"], ["soprano", "Soprano"], ["baritono", "Barítono"], ["baixo", "Baixo"]] as const;
function name(member?: Member | null) { return member?.invited_name || member?.invited_email || "Integrante"; }
function mail(member?: Member | null) { return member?.invited_email || ""; }
function voiceText(value?: string | null) { return VOICES.find(([key]) => key === (value ?? ""))?.[1] ?? "Definir por música"; }
function voiceClass(value?: string | null) { if (value === "lead") return "border-sky-300/30 bg-sky-400/15 text-sky-100"; if (value === "tenor") return "border-amber-300/30 bg-amber-400/15 text-amber-100"; if (value === "contralto") return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"; if (value === "soprano") return "border-fuchsia-300/30 bg-fuchsia-400/15 text-fuchsia-100"; if (value === "baritono") return "border-violet-300/30 bg-violet-400/15 text-violet-100"; if (value === "baixo") return "border-zinc-300/20 bg-zinc-400/10 text-zinc-100"; return "border-white/10 bg-white/[0.06] text-zinc-200"; }

export function ScaleMembersManager({ repertoireId, members, initialAssignments }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const selected = new Set(assignments.map((assignment) => assignment.member_id));
  const available = members.filter((member) => member.status !== "removed" && !selected.has(member.id));

  async function request(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch(`/api/ministerio/repertorios/${repertoireId}/members`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "Não foi possível salvar.");
    return payload;
  }

  async function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const memberId = String(form.get("member_id") ?? "");
    const assignedVoice = String(form.get("assigned_voice") ?? "") || null;
    const notes = String(form.get("notes") ?? "") || null;
    if (!memberId) return;
    const tempId = `temp-${memberId}`;
    const optimistic = { id: tempId, member_id: memberId, assigned_voice: assignedVoice, notes };
    setAssignments((current) => [...current.filter((item) => item.member_id !== memberId), optimistic]);
    setBusyId(tempId); setMessage("Salvando vocal...");
    try { const payload = await request("POST", { memberId, assignedVoice, notes }); setAssignments((current) => current.map((item) => item.id === tempId ? payload.row : item)); setMessage("Vocal salvo na escala."); (event.currentTarget as HTMLFormElement).reset(); setTimeout(() => setMessage(null), 900); } catch (error) { setAssignments((current) => current.filter((item) => item.id !== tempId)); setMessage(error instanceof Error ? error.message : "Erro ao salvar."); } finally { setBusyId(null); }
  }

  async function save(row: Assignment, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignedVoice = String(form.get("assigned_voice") ?? "") || null;
    const notes = String(form.get("notes") ?? "") || null;
    const before = assignments;
    setAssignments((current) => current.map((item) => item.id === row.id ? { ...item, assigned_voice: assignedVoice, notes } : item));
    setBusyId(row.id); setMessage("Salvando...");
    try { const payload = await request("PATCH", { assignmentId: row.id, assignedVoice, notes }); setAssignments((current) => current.map((item) => item.id === row.id ? payload.row : item)); setMessage("Vocal atualizado."); setTimeout(() => setMessage(null), 800); } catch (error) { setAssignments(before); setMessage(error instanceof Error ? error.message : "Erro ao salvar."); } finally { setBusyId(null); }
  }

  async function remove(row: Assignment) {
    const before = assignments;
    setAssignments((current) => current.filter((item) => item.id !== row.id));
    setBusyId(row.id); setMessage("Removendo vocal...");
    try { await request("DELETE", { assignmentId: row.id }); setMessage("Vocal removido."); setTimeout(() => setMessage(null), 800); } catch (error) { setAssignments(before); setMessage(error instanceof Error ? error.message : "Erro ao remover."); } finally { setBusyId(null); }
  }

  return <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">{message ? <div className="lg:col-span-2 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}<section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6"><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Adicionar vocal</p><h2 className="mt-2 text-2xl font-semibold text-white">Participantes da escala</h2></div><form onSubmit={add} className="mt-6 space-y-4"><label className="block"><span className="text-sm font-semibold text-zinc-200">Integrante</span><select name="member_id" required className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none"><option value="">Selecione</option>{available.map((member) => <option key={member.id} value={member.id}>{name(member)}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-zinc-200">Nipe padrão nesta escala</span><select name="assigned_voice" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-zinc-200">Observação para a escala</span><textarea name="notes" rows={4} maxLength={700} placeholder="Ex.: Vocalista fará tenor como base, mas pode mudar por música." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" /></label><button disabled={Boolean(busyId)} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75"><Save className="h-4 w-4" /> Salvar vocal na escala</button></form></section><section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6"><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Vocais atuais</p><h2 className="mt-2 text-2xl font-semibold text-white">{assignments.length} configurado{assignments.length === 1 ? "" : "s"}</h2><div className="mt-6 grid gap-3">{assignments.length ? assignments.map((assignment) => { const member = membersById.get(assignment.member_id); return <div key={assignment.id} className={`rounded-3xl border border-white/10 bg-black/20 p-5 transition ${busyId === assignment.id ? "opacity-70" : "hover:border-cyan-300/25"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold text-white">{name(member)}</h3><p className="mt-1 text-xs text-zinc-500">{mail(member)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${voiceClass(assignment.assigned_voice)}`}>{voiceText(assignment.assigned_voice)}</span></div>{assignment.notes ? <p className="mt-3 text-sm leading-6 text-zinc-300">{assignment.notes}</p> : null}<form onSubmit={(event) => save(assignment, event)} className="mt-4 grid gap-3 md:grid-cols-[1fr_1.4fr_auto]"><label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Nipe padrão</span><select name="assigned_voice" defaultValue={assignment.assigned_voice ?? ""} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label><span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Observação</span><input name="notes" defaultValue={assignment.notes ?? ""} maxLength={700} placeholder="Observação da escala" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500" /></label><button disabled={busyId === assignment.id} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75 md:w-fit"><Save className="h-4 w-4" /> Salvar</button></form><button onClick={() => remove(assignment)} disabled={busyId === assignment.id} className="mt-3 inline-flex w-fit items-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/20 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75"><Trash2 className="h-4 w-4" /> Remover vocal</button></div>; }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Nenhum vocal configurado ainda.</div>}</div></section></div>;
}
