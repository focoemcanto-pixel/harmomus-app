"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";

type LogItem = {
  id: string;
  created_at: string;
  channel: string | null;
  event: string;
  level: "debug" | "info" | "warning" | "error";
  message: string;
  payload: Record<string, unknown> | null;
  response: Record<string, unknown> | string | null;
};

function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => {
        if (/token|secret|password|apikey|apiKey|authorization/i.test(key)) return [key, "••••••"];
        return [key, maskSensitive(item)];
      }),
    );
  }
  return value;
}

function preview(value: unknown) {
  if (!value) return "—";
  return JSON.stringify(maskSensitive(value), null, 2);
}

function LevelIcon({ level }: { level: LogItem["level"] }) {
  if (level === "error") return <AlertTriangle size={16} className="text-red-300" />;
  if (level === "warning") return <AlertTriangle size={16} className="text-amber-300" />;
  if (level === "info") return <CheckCircle2 size={16} className="text-emerald-300" />;
  return <Info size={16} className="text-slate-300" />;
}

export function LogsViewer() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadLogs() {
    setIsLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/logs", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao carregar logs.");
      setLogs(json?.data ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar logs.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-white">Últimos 100 eventos</h3><p className="text-sm text-slate-400">Tokens e segredos são mascarados na visualização.</p></div>
        <button onClick={loadLogs} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"><RefreshCw size={15} className={isLoading ? "animate-spin" : ""} /> Atualizar</button>
      </div>
      {status ? <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{status}</p> : null}
      {isLoading ? <p className="mt-4 text-sm text-slate-400">Carregando logs...</p> : null}
      {!isLoading && !logs.length ? <p className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">Nenhum log registrado ainda.</p> : null}
      <div className="mt-4 grid gap-3">
        {logs.map((log) => (
          <article key={log.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <LevelIcon level={log.level} />
                <div><p className="font-semibold text-white">{log.message}</p><p className="text-xs text-slate-400">{log.event} · {log.channel || "sem canal"} · {new Date(log.created_at).toLocaleString("pt-BR")}</p></div>
              </div>
              <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase text-slate-200">{log.level}</span>
            </div>
            <details className="mt-3 rounded-xl bg-black/30 p-3 text-sm text-slate-200">
              <summary className="cursor-pointer text-cyan-100">Payload e resposta</summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <pre className="overflow-auto whitespace-pre-wrap text-xs leading-5">{preview(log.payload)}</pre>
                <pre className="overflow-auto whitespace-pre-wrap text-xs leading-5">{preview(log.response)}</pre>
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
