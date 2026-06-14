"use client";

import { useState } from "react";
import { CheckCircle2, Circle, CircleHelp, RotateCcw } from "lucide-react";

type StudyStatus = "not_studied" | "studied" | "doubt" | "review";

type OptimisticStudyActionsProps = {
  repertoireId: string;
  itemId: string;
  kitId: string;
  initialStatus?: StudyStatus | null;
  onSaved?: (status: StudyStatus) => void;
};

const options = [
  { status: "not_studied" as const, label: "Não estudada", icon: Circle, base: "border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/10", active: "border-zinc-300/30 bg-zinc-300/10 text-zinc-100" },
  { status: "studied" as const, label: "Estudei OK", icon: CheckCircle2, base: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20", active: "border-emerald-300/40 bg-emerald-400/20 text-emerald-50" },
  { status: "doubt" as const, label: "Tenho dúvida", icon: CircleHelp, base: "border-amber-300/25 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20", active: "border-amber-300/40 bg-amber-400/20 text-amber-50" },
  { status: "review" as const, label: "Preciso revisar", icon: RotateCcw, base: "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-400/20", active: "border-fuchsia-300/40 bg-fuchsia-400/20 text-fuchsia-50" },
];

export function OptimisticStudyActions({ repertoireId, itemId, kitId, initialStatus = "not_studied", onSaved }: OptimisticStudyActionsProps) {
  const [status, setStatus] = useState<StudyStatus>(initialStatus ?? "not_studied");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(nextStatus: StudyStatus) {
    if (saving || status === nextStatus) return;
    const previous = status;
    setStatus(nextStatus);
    setSaving(true);
    setMessage("Salvando...");

    try {
      const response = await fetch(`/api/ministerio/repertorios/${repertoireId}/study-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, kitId, studyStatus: nextStatus }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Não foi possível salvar o status.");
      setMessage("Salvo.");
      onSaved?.(nextStatus);
      window.setTimeout(() => setMessage(null), 800);
    } catch (error) {
      setStatus(previous);
      setMessage(error instanceof Error ? error.message : "Erro ao salvar status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-5 grid gap-2">
      {message ? <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-3 text-sm text-cyan-50">{message}</div> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const active = status === option.status;
          return (
            <button
              key={option.status}
              type="button"
              disabled={saving && active}
              onClick={() => void save(option.status)}
              className={`inline-flex w-fit items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-wait ${active ? option.active : option.base}`}
            >
              <Icon className="h-4 w-4" /> {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
