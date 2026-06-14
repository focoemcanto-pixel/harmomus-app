"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

type MemberOption = { id: string; label: string };

type TeamCreateFormProps = {
  members: MemberOption[];
};

export function TeamCreateForm({ members }: TeamCreateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = isSaving || isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const coordinatorMemberId = String(formData.get("coordinator_member_id") ?? "").trim();

    if (!name) {
      setMessage("Informe o nome da equipe.");
      return;
    }

    setMessage("Criando equipe...");
    setIsSaving(true);

    try {
      const response = await fetch("/api/ministerio/equipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, coordinator_member_id: coordinatorMemberId }),
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.team?.id) {
        setMessage(payload?.error || "Não foi possível criar a equipe.");
        return;
      }

      setMessage("Equipe criada. Abrindo montagem...");
      router.prefetch(`/ministerio/equipes/${payload.team.id}`);
      startTransition(() => {
        router.push(`/ministerio/equipes/${payload.team.id}`);
        router.refresh();
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado ao criar equipe.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {message ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}
      <label className="block">
        <span className="text-sm font-semibold text-zinc-200">Nome da equipe</span>
        <input name="name" required maxLength={100} placeholder="Ex.: Grupo A" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-zinc-200">Coordenador vocal padrão</span>
        <select name="coordinator_member_id" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50">
          <option value="">Definir depois</option>
          {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-zinc-200">Descrição</span>
        <textarea name="description" rows={3} maxLength={400} placeholder="Ex.: Equipe dos domingos à noite" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-300/50" />
      </label>
      <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 active:scale-[0.985] disabled:cursor-wait disabled:opacity-80">
        {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Plus className="h-4 w-4" />}
        {busy ? "Criando equipe..." : "Criar e montar equipe"}
      </button>
    </form>
  );
}
