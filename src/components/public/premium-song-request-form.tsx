"use client";

import { useState } from "react";
import { Loader2, Music2, Send } from "lucide-react";

export function PremiumSongRequestForm() {
  const [songName, setSongName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setStatus(null);

    if (!songName.trim() || !artistName.trim()) {
      setStatus({ type: "error", message: "Informe o nome da música e o artista original." });
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/premium-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "song",
        song_name: songName,
        artist_name: artistName,
        reference_link: referenceLink,
        notes,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      setStatus({ type: "error", message: result.error ?? "Não foi possível enviar a solicitação." });
      return;
    }

    setSongName("");
    setArtistName("");
    setReferenceLink("");
    setNotes("");
    setStatus({ type: "success", message: "Solicitação de nova música enviada com sucesso. Ela entrou na fila de produção." });
  }

  return (
    <form className="rounded-[2rem] border border-emerald-400/20 bg-[#161918]/90 p-6">
      <h3 className="mb-5 flex items-center gap-3 text-2xl font-black text-white"><Music2 />Solicitar nova música</h3>

      <div className="grid gap-4">
        <label className="block text-sm font-bold text-zinc-200">
          Nome da música *
          <input value={songName} onChange={(event) => { setSongName(event.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Nome da música" />
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Artista original *
          <input value={artistName} onChange={(event) => { setArtistName(event.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Artista original" />
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Link de referência
          <input value={referenceLink} onChange={(event) => { setReferenceLink(event.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="YouTube, Spotify ou outro link" />
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Observações
          <input value={notes} onChange={(event) => { setNotes(event.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Tom desejado, estilo, urgência ou detalhes" />
        </label>
      </div>

      {status ? (
        <p className={`mt-4 rounded-2xl border p-3 text-sm ${status.type === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"}`}>
          {status.message}
        </p>
      ) : null}

      <button type="button" onClick={submit} disabled={isSubmitting} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 font-black uppercase tracking-[0.16em] text-black disabled:cursor-wait disabled:opacity-70">
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {isSubmitting ? "Enviando..." : "Enviar solicitação"}
      </button>
    </form>
  );
}
