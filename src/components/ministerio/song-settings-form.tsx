"use client";

import { useState } from "react";
import { Save, Send, Users } from "lucide-react";

type MemberRow = { memberId: string; name: string; defaultVoice: string | null; defaultNotes: string | null; songVoice: string | null; songNotes: string | null };
type Props = { repertoireId: string; itemId: string; availableTones: string[]; selectedTone: string; itemNotes: string; rows: MemberRow[] };
const VOICES = [["", "Usar padrão da escala"], ["lead", "Lead"], ["tenor", "Tenor"], ["contralto", "Contralto"], ["soprano", "Soprano"], ["baritono", "Barítono"], ["baixo", "Baixo"]] as const;
function toneLabel(value: string) { return value.replace("#", "♯"); }

export function SongSettingsForm({ repertoireId, itemId, availableTones, selectedTone, itemNotes, rows }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assignments = rows.map((row) => ({
      memberId: row.memberId,
      assignedVoice: String(form.get(`voice_${row.memberId}`) ?? ""),
      notes: String(form.get(`notes_${row.memberId}`) ?? ""),
    }));
    setSaving(true);
    setMessage("Salvando configuração...");
    try {
      const response = await fetch(`/api/ministerio/repertorios/${repertoireId}/items/${itemId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyOverride: form.get("key_override"), itemNotes: form.get("item_notes"), assignments }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível salvar.");
      setLastSavedAt(Date.now());
      setMessage("Configuração salva.");
      window.setTimeout(() => setMessage(null), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar configuração.");
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={save}>{message ? <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">{message}</div> : null}<div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6"><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Tom da música</p><h2 className="mt-2 text-2xl font-semibold text-white">Tom exibido para equipe</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Selecione um tom disponível no kit ou solicite um novo tom sem sair deste campo.</p><div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-black/20"><label className="block p-4"><span className="text-sm font-semibold text-zinc-200">Tom definido</span><select name="key_override" defaultValue={selectedTone} disabled={!availableTones.length} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-60"><option value="">{availableTones.length ? "Usar tom padrão do kit" : "Nenhum tom disponível neste kit"}</option>{availableTones.map((tone) => <option key={tone} value={tone}>{toneLabel(tone)}</option>)}</select></label>{availableTones.length ? <div className="border-t border-white/10 px-4 pb-4 pt-3"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Tons disponíveis</p><div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em]">{availableTones.map((tone) => <span key={tone} className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-100">{toneLabel(tone)}</span>)}</div></div> : null}<div className="border-t border-emerald-300/20 bg-emerald-400/10 p-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Não achou o tom?</p><div className="mt-3 grid gap-2 md:grid-cols-[120px_1fr_auto]"><input form="request-tone-form" name="desired_tone" maxLength={40} placeholder="Ex.: D" className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-300/50" /><input form="request-tone-form" name="tone_request_notes" maxLength={300} placeholder="Observação opcional" className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-300/50" /><button form="request-tone-form" type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 active:scale-[0.98]"><Send className="h-4 w-4" /> Solicitar</button></div></div></div><label className="mt-4 block"><span className="text-sm font-semibold text-zinc-200">Observação da música</span><textarea name="item_notes" defaultValue={itemNotes ?? ""} rows={4} maxLength={600} placeholder="Ex.: Atenção à entrada da ponte." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label></section><section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6"><div className="flex items-start gap-4"><div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-cyan-100"><Users className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Vocais da música</p><h2 className="mt-2 text-2xl font-semibold text-white">Nipe por vocalista</h2><p className="mt-2 text-sm text-zinc-400">Cada vocalista receberá seu nipe específico ao estudar esta música.</p></div></div><div className="mt-6 grid gap-3">{rows.length ? rows.map((row) => { const defaultVoice = row.songVoice ?? row.defaultVoice ?? ""; const defaultNotes = row.songNotes ?? ""; return <div key={row.memberId} className="rounded-3xl border border-white/10 bg-black/20 p-5 transition hover:border-cyan-300/25"><h3 className="text-lg font-semibold text-white">{row.name}</h3><p className="mt-1 text-sm text-zinc-400">Nipe padrão da escala: {row.defaultVoice || "não definido"}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><label><span className="text-sm font-semibold text-zinc-200">Nipe nesta música</span><select name={`voice_${row.memberId}`} defaultValue={defaultVoice} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">{VOICES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label><span className="text-sm font-semibold text-zinc-200">Observação individual</span><input name={`notes_${row.memberId}`} defaultValue={defaultNotes} maxLength={300} placeholder="Ex.: entra no refrão" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" /></label></div></div>; }) : <div className="rounded-3xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-zinc-400">Adicione vocalistas na escala antes de configurar esta música.</div>}</div></section></div><button disabled={saving} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-75"><Save className="h-4 w-4" /> {saving ? "Salvando configuração..." : lastSavedAt ? "Salvar novamente" : "Salvar configuração da música"}</button></form>;
}
