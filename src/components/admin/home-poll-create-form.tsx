"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function HomePollCreateForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const formData = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/admin/home-polls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eyebrow: String(formData.get("eyebrow") ?? ""),
          order_index: Number(formData.get("order_index") ?? 0),
          title: String(formData.get("title") ?? ""),
          question: String(formData.get("question") ?? ""),
          subtitle: String(formData.get("subtitle") ?? ""),
          options: String(formData.get("options") ?? ""),
          active: formData.get("active") === "on",
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? "Não foi possível salvar a enquete.");
      }

      setSuccess("Enquete criada com sucesso.");
      router.push("/admin/enquetes");
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível salvar a enquete.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-white/10 bg-surface p-5 shadow-premium md:p-7">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Selo</span>
          <input name="eyebrow" defaultValue="Enquete Premium" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-zinc-200">Ordem na home</span>
          <input name="order_index" type="number" defaultValue={0} className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-zinc-200">Título visual</span>
        <input name="title" defaultValue="Você decide o próximo kit" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-zinc-200">Pergunta</span>
        <input name="question" required defaultValue="Qual Kit Vocal você quer ver aqui essa semana?" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-zinc-200">Subtítulo</span>
        <textarea name="subtitle" rows={3} defaultValue="Vote e ajude a escolher o próximo lançamento do Harmomus." className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60" />
      </label>

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-zinc-200">Músicas da enquete</span>
        <textarea
          name="options"
          required
          rows={8}
          defaultValue={`Sublime - FHOP\nNinguém Explica Deus - Preto no Branco\nAh, Jesus - Julliany Souza\nEmanuel - Ministério Zoe\nÚnico - Fernandinho`}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
        />
        <p className="text-xs text-zinc-500">Use uma música por linha. Pode escrever como: Música - Artista.</p>
      </label>

      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-200">
        <input name="active" type="checkbox" defaultChecked className="h-4 w-4" />
        Ativar enquete imediatamente na home
      </label>

      {error ? <p className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p> : null}
      {success ? <p className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <a href="/admin/enquetes" className="inline-flex justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-white/10">Cancelar</a>
        <button disabled={saving} className="inline-flex justify-center rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-black text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Salvando..." : "Salvar enquete"}
        </button>
      </div>
    </form>
  );
}
