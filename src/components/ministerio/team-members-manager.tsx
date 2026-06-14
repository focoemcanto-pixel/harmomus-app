"use client";

import { useMemo, useState } from "react";
import { Save, Settings, Star, Trash2, UserPlus } from "lucide-react";

type MinistryMember = { id: string; invited_name: string | null; invited_email: string | null; status?: string | null };
type TeamMember = { id: string; member_id: string; assigned_voice: string | null; notes: string | null };

type Props = { templateId: string; members: MinistryMember[]; initialRows: TeamMember[]; initialCoordinatorId: string | null };

const VOICES = [["", "Sem definição"], ["lead", "Lead"], ["tenor", "Tenor"], ["contralto", "Contralto"], ["soprano", "Soprano"], ["baritono", "Barítono"], ["baixo", "Baixo"]] as const;
function memberName(member?: MinistryMember | null) { return member?.invited_name || member?.invited_email || "Integrante"; }
function voiceLabel(value?: string | null) { return VOICES.find(([key]) => key === (value ?? ""))?.[1] ?? "Sem definição"; }
function badge(value?: string | null) { if (value === "lead") return "border-sky-300/30 bg-sky-400/15 text-sky-100"; if (value === "tenor") return "border-amber-300/30 bg-amber-400/15 text-amber-100"; if (value === "contralto") return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100"; if (value === "soprano") return "border-fuchsia-300/30 bg-fuchsia-400/15 text-fuchsia-100"; if (value === "baritono") return "border-violet-300/30 bg-violet-400/15 text-violet-100"; if (value === "baixo") return "border-zinc-300/20 bg-zinc-400/10 text-zinc-100"; return "border-white/10 bg-white/[0.06] text-zinc-200"; }

export function TeamMembersManager({ templateId, members, initialRows, initialCoordinatorId }: Props) {
  const [rows, setRows] = useState<TeamMember[]>(initialRows);
  const [coordinatorId, setCoordinatorId] = useState<string | null>(initialCoordinatorId);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const membersById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const selected = new Set(rows.map((row) => row.member_id));
  const available = members.filter((member) => member.status !== "removed" && !selected.has(member.id));

  async function request(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const response = await fetch(`/api/ministerio/equipes/${templateId}/members`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    const makeCoordinator = String(form.get("make_coordinator") ?? "") === "on";
    if (!memberId) return;
    const tempId = `temp-${memberId}`;
    const optimistic = { id: tempId, member_id: memberId, assigned_voice: assignedVoice, notes };
    setRows((current) => [...current.filter((row) => row.member_id !== memberId), optimistic]);
    if (makeCoordinator) setCoordinatorId(memberId);
    setBusyId(tempId);
    setMessage("Adicionando...");
    try { const payload = await request("POST", { memberId, assignedVoice, notes, makeCoordinator }); setRows((current) => current.map((row) => row.id === tempId ? payload.row : row)); setCoordinatorId(payload.coordinatorMemberId ?? null); setMessage("Integrante adicionado."); (event.currentTarget as HTMLFormElement).reset(); setTimeout(() => setMessage(null), 900); } catch (error) { setRows((current) => current.filter((row) => row.id !== tempId)); setMessage(error instanceof Error ? error.message : "Erro ao adicionar."); } finally { setBusyId(null); }
  }

  async function save(row: TeamMember, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignedVoice = String(form.get("assigned_voice") ?? "") || null;
    const notes = String(form.get("notes") ?? "") || null;
    const makeCoordinator = String(form.get("make_coordinator") ?? "") === "on";
    const before = rows;
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, assigned_voice: assignedVoice, notes } : item));
    if (makeCoordinator) setCoordinatorId(row.member_id);
    setBusyId(row.id); setMessage("Salvando...");
    try { const payload = await request("PATCH", { rowId: row.id, memberId: row.member_id, assignedVoice, notes, makeCoordinator }); if (payload.coordinatorMemberId !== undefined) setCoordinatorId(payload.coordinatorMemberId); setMessage("Salvo."); setTimeout(() => setMessage(null), 800); } catch (error) { setRows(before); setMessage(error instanceof Error ? error.message : "Erro ao salvar."); } finally { setBusyId(null); }
  }

  async function remove(row: TeamMember) {
    const before = rows; const oldCoordinator = coordinatorId;
    setRows((current) => current.filter((item) => item.id !== row.id));
    if (coordinatorId === row.member_id) setCoordinatorId(null);
    setBusyId(row.id); setMessage("Removendo...");
    try { const payload = await request("DELETE", { rowId: row.id, memberId: row.member_id }); setCoordinatorId(payload.coordinatorMemberId ?? null); setMessage("Removido."); setTimeout(() => setMessage(null), 800); } catch (error) { setRows(before); setCoordinatorId(oldCoordinator); setMessage(error instanceof Error ? error.message : "Erro ao remover."); } finally { setBusyId(null); }
  }

  async function clearCoordinator() {
    const before = coordinatorId; setCoordinatorId(null); setMessage("Removendo coordenador...");
    try { await request("PATCH", { clearCoordinator: true }); setMessage("Coordenador removido."); setTimeout(() => setMessage(null), 800); } catch (error) { setCoordinatorId(before); setMessage(error instanceof Error ? error.message : "Erro ao remover coordenador."); }
  }

  const coordinator = coordinatorId ? membersById.get(coordinatorId) : null;
  return <div className="space-y-6">{message ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}<div className="flex flex-wrap gap-3 text-sm"><span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-zinc-200">{rows.length} integrante{rows.length === 1 ? "" : "s"}</span>{coordinator ? <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 font-semibold text-amber-100"><Star className="h-4 w-4 fill-current" /> Coordenador vocal: {memberName(coordinator)}</span> : <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-zinc-300"><Star className="h-4 w-4" /> Sem coordenador vocal</span>}</div><details className="rounded-3xl border border-white/10 bg-black/20 p-5"><summary className="cursor-pointer list-none text-sm font-bold text-cyan-100">+ Adicionar integrante</summary><form onSubmit={add} className="mt-4 space-y-4"><select name="member_id" required className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white"><option value="">Selecione</option>{available.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}</select><select name="assigned_voice" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white">{VOICES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select><textarea name="notes" rows={3} placeholder="Observação padrão" className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white" /><label className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100"><input type="checkbox" name="make_coordinator" /> Definir como coordenador vocal</label><button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 active:scale-[0.98]"><UserPlus className="h-4 w-4" /> Adicionar</button></form></details><div className="flex items-end justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Formação</p><h2 className="mt-2 text-2xl font-semibold">Integrantes da equipe</h2></div>{coordinator ? <button onClick={clearCoordinator} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-zinc-200 active:scale-[0.98]">Remover coordenador</button> : null}</div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{rows.length ? rows.map((row) => { const member = membersById.get(row.member_id); const isCoordinator = coordinatorId === row.member_id; return <div key={row.id} className={`rounded-3xl border border-white/10 bg-black/20 p-5 transition ${busyId === row.id ? "opacity-70" : "hover:border-cyan-300/30 hover:bg-white/[0.045]"}`}><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-semibold text-white">{memberName(member)}</h3><p className="mt-1 text-xs text-zinc-500">{member?.invited_email}</p></div>{isCoordinator ? <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-100">Coordenador</span> : null}</div><div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-bold ${badge(row.assigned_voice)}`}>{voiceLabel(row.assigned_voice)}</span>{row.notes ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-300">Com observação</span> : null}</div>{row.notes ? <p className="mt-4 text-sm leading-6 text-zinc-300">{row.notes}</p> : null}<details className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-cyan-100"><Settings className="mr-2 inline h-4 w-4" /> Configurar</summary><form onSubmit={(event) => save(row, event)} className="mt-4 space-y-3"><select name="assigned_voice" defaultValue={row.assigned_voice ?? ""} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white">{VOICES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select><textarea name="notes" defaultValue={row.notes ?? ""} rows={3} className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white" />{!isCoordinator ? <label className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-semibold text-amber-100"><input type="checkbox" name="make_coordinator" /> Tornar coordenador vocal</label> : null}<button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 active:scale-[0.98]"><Save className="h-4 w-4" /> Salvar alterações</button></form><button onClick={() => remove(row)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100 active:scale-[0.98]"><Trash2 className="h-4 w-4" /> Remover da equipe</button></details></div>; }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400 md:col-span-2 xl:col-span-3">Esta equipe ainda não tem vocalistas configurados.</div>}</div></div>;
}
