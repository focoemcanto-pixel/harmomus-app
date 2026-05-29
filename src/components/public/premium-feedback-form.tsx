"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

export function PremiumFeedbackForm() {
  const [category, setCategory] = useState("Experiência na plataforma");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    setStatus(null);

    if (!message.trim()) {
      setStatus({ type: "error", message: "Escreva sua mensagem antes de enviar." });
      return;
    }

    setIsSubmitting(true);

    const response = await fetch("/api/premium-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "feedback",
        song_name: `Feedback: ${category}`,
        notes: email.trim() ? `${message}\n\nEmail alternativo: ${email}` : message,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok) {
      setStatus({ type: "error", message: result.error ?? "Não foi possível enviar o feedback." });
      return;
    }

    setCategory("Experiência na plataforma");
    setMessage("");
    setEmail("");
    setStatus({ type: "success", message: "Feedback enviado com sucesso. Obrigado por ajudar a melhorar o Harmomus." });
  }

  return (
    <form className="rounded-[2rem] border border-emerald-400/20 bg-[#161918]/90 p-6">
      <h3 className="mb-5 flex items-center gap-3 text-2xl font-black text-white"><MessageCircle />Enviar feedback</h3>
      <div className="grid gap-4">
        <label className="block text-sm font-bold text-zinc-200">
          Tipo *
          <select value={category} onChange={(event) => { setCategory(event.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring">
            <option className="bg-zinc-950">Experiência na plataforma</option>
            <option className="bg-zinc-950">Sugestão de melhoria</option>
            <option className="bg-zinc-950">Problema técnico</option>
            <option className="bg-zinc-950">Qualidade dos kits</option>
            <option className="bg-zinc-950">Outro</option>
          </select>
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Mensagem *
          <textarea value={message} onChange={(event) => { setMessage(event.target.value); setStatus(null); }} className="mt-2 min-h-28 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Conte o que você percebeu, precisa ou gostaria de melhorar" />
        </label>

        <label className="block text-sm font-bold text-zinc-200">
          Email opcional
          <input value={email} onChange={(event) => { setEmail(event.target.value); setStatus(null); }} className="mt-2 h-12 w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white outline-none ring-emerald-300/40 focus:ring" placeholder="Email para retorno, se desejar" />
        </label>
      </div>

      {status ? (
        <p className={`mt-4 rounded-2xl border p-3 text-sm ${status.type === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-500/10 text-rose-100"}`}>
          {status.message}
        </p>
      ) : null}

      <button type="button" onClick={submit} disabled={isSubmitting} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-400 to-cyan-300 font-black uppercase tracking-[0.16em] text-black disabled:cursor-wait disabled:opacity-70">
        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        {isSubmitting ? "Enviando..." : "Enviar feedback"}
      </button>
    </form>
  );
}
