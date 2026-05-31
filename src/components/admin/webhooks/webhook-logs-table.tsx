"use client";

import { ArrowLeft, CheckCircle2, Clock3, Download, Filter, Loader2, RefreshCw, RotateCcw, Search, ShieldAlert, Trash2, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { getWebhookEventLabel, type WebhookLog } from "@/types/webhooks";

function formatDate(value?: string | null) {
  return value ? formatDateTimeBR(value) : "Nunca";
}

function isTestLog(log: WebhookLog) {
  return Boolean((log.request_body as any)?.test);
}

function downloadCsv(logs: WebhookLog[]) {
  const header = ["data", "evento", "status_http", "sucesso", "tipo", "duracao_ms", "tentativa", "delivery_id", "erro"];
  const rows = logs.map((log) => [
    formatDate(log.created_at),
    getWebhookEventLabel(log.event),
    String(log.status),
    log.success ? "sim" : "nao",
    isTestLog(log) ? "teste" : "producao",
    String(log.duration_ms),
    String((log.retry_attempt ?? 0) + 1),
    log.delivery_id,
    log.error_message ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `webhook-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type CleanupTarget = {
  scope: "tests" | "failed" | "old" | "endpoint";
  label: string;
  description: string;
  olderThanDays?: number;
};

export function WebhookLogsTable() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [success, setSuccess] = useState("all");
  const [kind, setKind] = useState("all");
  const [event, setEvent] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupTarget, setCleanupTarget] = useState<CleanupTarget | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const endpointId = searchParams.get("endpoint_id");
    if (endpointId) setEndpoint(endpointId);
  }, [searchParams]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (success !== "all") params.set("success", success);
    if (event) params.set("event", event);
    if (endpoint) params.set("endpoint", endpoint);
    const res = await fetch(`/api/admin/webhooks/logs?${params.toString()}`);
    const json = await res.json().catch(() => null);
    setLogs(json?.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, event, endpoint]);

  const visibleLogs = useMemo(() => {
    return logs.filter((log) => {
      const haystack = `${getWebhookEventLabel(log.event)} ${log.event} ${log.delivery_id} ${log.status} ${log.error_message ?? ""}`.toLowerCase();
      const matchesSearch = !q || haystack.includes(q.toLowerCase());
      const matchesKind = kind === "all" || (kind === "test" ? isTestLog(log) : !isTestLog(log));
      return matchesSearch && matchesKind;
    });
  }, [logs, q, kind]);

  const stats = useMemo(() => {
    const total = visibleLogs.length;
    const successful = visibleLogs.filter((log) => log.success).length;
    const failed = total - successful;
    const test = visibleLogs.filter(isTestLog).length;
    const avg = total ? Math.round(visibleLogs.reduce((sum, log) => sum + Number(log.duration_ms ?? 0), 0) / total) : 0;
    const last = visibleLogs[0]?.created_at ?? null;
    return { total, successful, failed, test, avg, last, successRate: total ? Math.round((successful / total) * 100) : 0 };
  }, [visibleLogs]);

  async function retry(logId: string) {
    setRetrying(logId);
    setBanner(null);
    const res = await fetch("/api/admin/webhooks/logs/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Não foi possível reenviar este webhook." });
      setRetrying(null);
      return;
    }
    setBanner({ type: "success", message: "Reenvio solicitado. Atualize os logs para acompanhar o resultado." });
    setRetrying(null);
    await load();
  }

  async function cleanupLogs() {
    if (!cleanupTarget) return;
    setCleaning(true);
    setBanner(null);

    const params = new URLSearchParams({ scope: cleanupTarget.scope, confirm: "true" });
    if (cleanupTarget.scope === "old") params.set("older_than_days", String(cleanupTarget.olderThanDays ?? 90));
    if (cleanupTarget.scope === "endpoint") params.set("endpoint", endpoint);

    const res = await fetch(`/api/admin/webhooks/logs?${params.toString()}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Não foi possível limpar os logs." });
      setCleaning(false);
      return;
    }

    setBanner({ type: "success", message: `${json?.deleted ?? 0} log(s) removido(s).` });
    setCleanupTarget(null);
    setCleaning(false);
    await load();
  }

  return (
    <section className="space-y-6 text-zinc-100">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_34%),rgba(9,9,11,0.86)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/admin/webhooks" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.07]"><ArrowLeft size={14} /> Voltar para webhooks</Link>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.34em] text-cyan-200/80">Monitoramento</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Histórico de entregas</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Acompanhe envios, falhas e testes sem deixar payloads técnicos poluindo a operação principal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/5"><RefreshCw size={15} /> Atualizar</button>
            <button onClick={() => downloadCsv(visibleLogs)} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm text-cyan-100 hover:bg-cyan-500/15"><Download size={15} /> Exportar CSV</button>
          </div>
        </div>
        {banner ? <div className={`mt-5 rounded-2xl px-4 py-3 text-sm ${banner.type === "success" ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>{banner.message}</div> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Registros</p><p className="mt-3 text-3xl font-semibold">{stats.total}</p><p className="text-xs text-zinc-500">No filtro atual</p></div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Sucesso</p><p className="mt-3 text-3xl font-semibold text-emerald-100">{stats.successful}</p><p className="text-xs text-emerald-200/60">{stats.successRate}% de taxa</p></div>
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5"><p className="text-xs uppercase tracking-[0.22em] text-rose-300/70">Falhas</p><p className="mt-3 text-3xl font-semibold text-rose-100">{stats.failed}</p><p className="text-xs text-rose-200/60">Precisam atenção</p></div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Testes</p><p className="mt-3 text-3xl font-semibold">{stats.test}</p><p className="text-xs text-zinc-500">Payloads simulados</p></div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Último</p><p className="mt-3 text-sm font-semibold text-zinc-200">{formatDate(stats.last)}</p><p className="text-xs text-zinc-500">Média {stats.avg}ms</p></div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5"><Search size={16} className="text-zinc-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar evento, status ou delivery" className="w-64 max-w-[70vw] bg-transparent text-sm outline-none placeholder:text-zinc-600" /></div>
          <select value={success} onChange={(e) => setSuccess(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none"><option value="all">Todos os status</option><option value="true">Somente sucesso</option><option value="false">Somente falha</option></select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none"><option value="all">Teste + produção</option><option value="test">Somente testes</option><option value="live">Somente produção</option></select>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5"><Filter size={15} className="text-zinc-500" /><input value={event} onChange={(e) => setEvent(e.target.value)} className="w-48 bg-transparent text-sm outline-none placeholder:text-zinc-600" placeholder="Filtrar evento" /></div>
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600" placeholder="Endpoint ID" />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-white">Ações rápidas</p><p className="text-xs text-zinc-500">Limpezas exigem confirmação e usam escopos seguros.</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCleanupTarget({ scope: "tests", label: "Limpar testes", description: "Remove somente logs gerados pelo botão de teste." })} className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/15"><Trash2 size={14} /> Limpar testes</button>
            <button onClick={() => setCleanupTarget({ scope: "failed", label: "Limpar falhas", description: "Remove somente logs que falharam." })} className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 hover:bg-rose-500/15"><Trash2 size={14} /> Limpar falhas</button>
            {endpoint ? <button onClick={() => setCleanupTarget({ scope: "endpoint", label: "Limpar esta integração", description: "Remove todos os logs da integração informada no filtro Endpoint ID." })} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"><Trash2 size={14} /> Limpar integração</button> : null}
            <button onClick={() => setCleanupTarget({ scope: "old", label: "Limpar antigos", description: "Remove somente logs com mais de 90 dias.", olderThanDays: 90 })} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"><Trash2 size={14} /> Limpar antigos</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-zinc-950/60 p-6 text-sm text-zinc-400"><Loader2 size={16} className="animate-spin" /> Carregando logs...</div>
      ) : visibleLogs.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 bg-zinc-950/50 p-10 text-center"><Clock3 className="mx-auto mb-3 text-zinc-500" /><p className="font-medium">Nenhum log encontrado</p><p className="mt-1 text-sm text-zinc-500">Ajuste os filtros ou execute um teste de webhook.</p></div>
      ) : (
        <div className="space-y-3">
          {visibleLogs.map((log) => {
            const test = isTestLog(log);
            return (
              <article key={log.id} className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${log.success ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>{log.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{log.success ? "Sucesso" : "Falha"}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400">{test ? "Teste" : "Produção"}</span>
                      <h2 className="text-sm font-semibold text-white">{getWebhookEventLabel(log.event)}</h2>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Clock3 size={13} /> {formatDate(log.created_at)} · HTTP {log.status} · {log.duration_ms}ms · tentativa {(log.retry_attempt ?? 0) + 1}</p>
                    {log.error_message ? <p className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"><ShieldAlert size={14} /> {log.error_message}</p> : null}
                  </div>
                  <button disabled={retrying === log.id || log.success} onClick={() => void retry(log.id)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">{retrying === log.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reenviar</button>
                </div>
                <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <summary className="cursor-pointer text-sm text-cyan-300">Ver detalhes técnicos</summary>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify({ delivery_id: log.delivery_id, payload: log.request_body, response: log.response_body, headers: log.request_headers, error: log.error_message }, null, 2)}</pre>
                </details>
              </article>
            );
          })}
        </div>
      )}

      {cleanupTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-rose-400/25 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200"><Trash2 size={20} /></div>
                <div><h2 className="text-xl font-semibold text-white">{cleanupTarget.label}</h2><p className="mt-2 text-sm leading-relaxed text-zinc-400">{cleanupTarget.description}</p><p className="mt-2 text-xs text-rose-200/80">Essa ação não pode ser desfeita.</p></div>
              </div>
              <button onClick={() => setCleanupTarget(null)} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:bg-white/5"><X size={15} /></button>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button onClick={() => setCleanupTarget(null)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">Cancelar</button>
              <button disabled={cleaning} onClick={() => void cleanupLogs()} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-70">{cleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Confirmar limpeza</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
