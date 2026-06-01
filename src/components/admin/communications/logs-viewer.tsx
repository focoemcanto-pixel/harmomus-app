"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Info, RefreshCw, Search } from "lucide-react";

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
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, /token|secret|password|apikey|apiKey|authorization/i.test(key) ? "••••••" : maskSensitive(item)]));
  }
  return value;
}

function preview(value: unknown) {
  if (!value) return "—";
  return JSON.stringify(maskSensitive(value), null, 2);
}

function levelTone(level: LogItem["level"]) {
  if (level === "error") return "border-red-400/30 bg-red-500/10 text-red-100";
  if (level === "warning") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  if (level === "info") return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  return "border-white/10 bg-white/[0.03] text-slate-200";
}

function LevelIcon({ level }: { level: LogItem["level"] }) {
  if (level === "error") return <AlertTriangle size={16} className="text-red-300" />;
  if (level === "warning") return <AlertTriangle size={16} className="text-amber-300" />;
  if (level === "info") return <CheckCircle2 size={16} className="text-emerald-300" />;
  return <Info size={16} className="text-slate-300" />;
}

function toCsv(logs: LogItem[]) {
  const rows = [["created_at", "channel", "status", "event", "message"], ...logs.map((log) => [log.created_at, log.channel ?? "", log.level, log.event, log.message])];
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

export function LogsViewer() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [channel, setChannel] = useState("");
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (level) params.set("status", level);
    if (query) params.set("q", query);
    return `/api/admin/comunicacao/logs?${params.toString()}`;
  }, [channel, level, query]);

  async function loadLogs() {
    setIsLoading(true);
    setStatus(null);
    try {
      const response = await fetch(url, { cache: "no-store" });
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
  }, [url]);

  function exportCsv() {
    const blob = new Blob([toCsv(logs)], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `communication-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5 shadow-2xl shadow-black/20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-lg font-semibold text-white">Logs premium de comunicação</h3><p className="text-sm text-slate-400">JSON técnico fica recolhido; tokens e segredos são mascarados.</p></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportCsv} disabled={!logs.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"><Download size={15} /> CSV</button>
          <button onClick={loadLogs} disabled={isLoading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"><RefreshCw size={15} className={isLoading ? "animate-spin" : ""} /> Atualizar</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[1.2fr_0.6fr_0.6fr]">
        <label className="relative text-sm text-slate-300"><Search className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-slate-500" />Busca por campanha/evento/usuário<input value={query} onChange={(e) => setQuery(e.target.value)} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900 py-2.5 pl-9 pr-3 text-white" /></label>
        <label className="text-sm text-slate-300">Canal<select value={channel} onChange={(e) => setChannel(e.target.value)} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white"><option value="">Todos</option><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option></select></label>
        <label className="text-sm text-slate-300">Status<select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white"><option value="">Todos</option><option value="info">Info/sent</option><option value="warning">Warning/queued</option><option value="error">Failed</option><option value="debug">Debug</option></select></label>
      </div>

      {status ? <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{status}</p> : null}
      {isLoading ? <p className="mt-4 text-sm text-slate-400">Carregando logs...</p> : null}
      {!isLoading && !logs.length ? <p className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">Nenhum log encontrado para os filtros atuais.</p> : null}
      <div className="mt-4 grid gap-3">
        {logs.map((log) => (
          <article key={log.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <LevelIcon level={log.level} />
                <div><p className="font-semibold text-white">{log.message}</p><p className="text-xs text-slate-400">{log.event} · {log.channel || "sem canal"} · {new Date(log.created_at).toLocaleString("pt-BR")}</p></div>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs uppercase ${levelTone(log.level)}`}>{log.level}</span>
            </div>
            <details className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-slate-200">
              <summary className="cursor-pointer text-cyan-100">Detalhes técnicos</summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-5">{preview(log.payload)}</pre>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 text-xs leading-5">{preview(log.response)}</pre>
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
