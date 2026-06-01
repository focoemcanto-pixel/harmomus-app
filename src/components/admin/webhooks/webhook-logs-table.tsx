"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Filter,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  Webhook,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { getWebhookEventLabel, type WebhookLog } from "@/types/webhooks";

type EndpointSummary = {
  id: string;
  name: string;
  events?: string[];
  active?: boolean;
  url?: string;
  last_triggered_at?: string | null;
};

type EnrichedWebhookLog = WebhookLog & {
  endpoint?: EndpointSummary | null;
};

type ApiSummary = {
  total: number;
  success: number;
  failed: number;
  status0: number;
  avgMs: number;
};

function formatDate(value?: string | null) {
  return value ? formatDateTimeBR(value) : "Nunca";
}

function isTestLog(log: EnrichedWebhookLog) {
  return Boolean((log.request_body as any)?.test);
}

function getPayloadValue(log: EnrichedWebhookLog, keys: string[]) {
  const payload = (log.request_body ?? {}) as Record<string, any>;
  for (const key of keys) {
    const value = payload?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const nestedSources = [payload.recipient, payload.contact, payload.customer, payload.contato, payload.buyer, payload.variables, payload.data?.customer];
  for (const source of nestedSources) {
    if (!source || typeof source !== "object") continue;
    for (const key of keys) {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return "";
}

function getLogPhone(log: EnrichedWebhookLog) {
  return getPayloadValue(log, ["phone", "telefone", "Telefone", "whatsapp", "WhatsApp", "number", "numero", "to", "recipient_phone", "contact_phone", "phone_number", "whatsapp_number"]);
}

function getLogEmail(log: EnrichedWebhookLog) {
  return getPayloadValue(log, ["email", "Email"]);
}

function getLogName(log: EnrichedWebhookLog) {
  return getPayloadValue(log, ["name", "nome", "Nome", "full_name"]);
}

function simplifyPhone(value: string) {
  return value.replace(/\D/g, "");
}

function downloadCsv(logs: EnrichedWebhookLog[]) {
  const header = ["data", "endpoint", "evento", "telefone", "email", "status_http", "sucesso", "tipo", "duracao_ms", "tentativa", "delivery_id", "erro"];
  const rows = logs.map((log) => [
    formatDate(log.created_at),
    log.endpoint?.name ?? log.endpoint_id,
    getWebhookEventLabel(log.event),
    getLogPhone(log),
    getLogEmail(log),
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

const quickFilters = [
  { label: "Todos", value: "" },
  { label: "Cadastro FREE", value: "subscription.free.created" },
  { label: "Plus", value: "plan.plus_activated" },
  { label: "Premium", value: "plan.premium_activated" },
  { label: "Falha pagamento", value: "subscription.payment_failed" },
  { label: "Cancelamento", value: "subscription.canceled" },
];

export function WebhookLogsTable() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<EnrichedWebhookLog[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointSummary[]>([]);
  const [apiSummary, setApiSummary] = useState<ApiSummary | null>(null);
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
    params.set("limit", "250");

    const res = await fetch(`/api/admin/webhooks/logs?${params.toString()}`);
    const json = await res.json().catch(() => null);
    setLogs(json?.data ?? []);
    setEndpoints(json?.endpoints ?? []);
    setApiSummary(json?.summary ?? null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, event, endpoint]);

  const visibleLogs = useMemo(() => {
    const cleanQuery = q.toLowerCase().trim();
    const cleanPhoneQuery = simplifyPhone(q);

    return logs.filter((log) => {
      const phone = getLogPhone(log);
      const email = getLogEmail(log);
      const name = getLogName(log);
      const endpointName = log.endpoint?.name ?? "";
      const haystack = `${getWebhookEventLabel(log.event)} ${log.event} ${log.delivery_id} ${log.status} ${log.error_message ?? ""} ${phone} ${email} ${name} ${endpointName}`.toLowerCase();
      const phoneMatches = cleanPhoneQuery ? simplifyPhone(phone).includes(cleanPhoneQuery) : false;
      const matchesSearch = !cleanQuery || haystack.includes(cleanQuery) || phoneMatches;
      const matchesKind = kind === "all" || (kind === "test" ? isTestLog(log) : !isTestLog(log));
      return matchesSearch && matchesKind;
    });
  }, [logs, q, kind]);

  const stats = useMemo(() => {
    const total = visibleLogs.length;
    const successful = visibleLogs.filter((log) => log.success).length;
    const failed = total - successful;
    const test = visibleLogs.filter(isTestLog).length;
    const status0 = visibleLogs.filter((log) => Number(log.status ?? 0) === 0).length;
    const avg = total ? Math.round(visibleLogs.reduce((sum, log) => sum + Number(log.duration_ms ?? 0), 0) / total) : 0;
    const last = visibleLogs[0]?.created_at ?? null;
    return { total, successful, failed, test, status0, avg, last, successRate: total ? Math.round((successful / total) * 100) : 0 };
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

  async function copy(value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setBanner({ type: "success", message: "Copiado para a área de transferência." });
  }

  return (
    <section className="space-y-6 text-zinc-100">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_34%),rgba(9,9,11,0.86)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <Link href="/admin/webhooks" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.07]"><ArrowLeft size={14} /> Voltar para webhooks</Link>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.34em] text-cyan-200/80">Monitoramento</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Histórico de entregas</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Acompanhe disparos reais, testes, falhas e respostas do LabMessage sem abrir SQL.</p>
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
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-5"><p className="text-xs uppercase tracking-[0.22em] text-rose-300/70">Falhas</p><p className="mt-3 text-3xl font-semibold text-rose-100">{stats.failed}</p><p className="text-xs text-rose-200/60">Status 0: {stats.status0}</p></div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Testes</p><p className="mt-3 text-3xl font-semibold">{stats.test}</p><p className="text-xs text-zinc-500">Payloads simulados</p></div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Último</p><p className="mt-3 text-sm font-semibold text-zinc-200">{formatDate(stats.last)}</p><p className="text-xs text-zinc-500">Média {stats.avg || apiSummary?.avgMs || 0}ms</p></div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5"><Search size={16} className="text-zinc-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar telefone, e-mail, endpoint ou evento" className="w-80 max-w-[70vw] bg-transparent text-sm outline-none placeholder:text-zinc-600" /></div>
          <select value={success} onChange={(e) => setSuccess(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none"><option value="all">Todos os status</option><option value="true">Somente sucesso</option><option value="false">Somente falha</option></select>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none"><option value="all">Teste + produção</option><option value="test">Somente testes</option><option value="live">Somente produção</option></select>
          <select value={event} onChange={(e) => setEvent(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none">
            <option value="">Todos os eventos</option>
            {quickFilters.filter((item) => item.value).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none">
            <option value="">Todos endpoints</option>
            {endpoints.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {quickFilters.map((item) => <button key={item.label} onClick={() => setEvent(item.value)} className={`rounded-full border px-3 py-1.5 text-xs ${event === item.value ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-zinc-400 hover:bg-white/[0.07]"}`}>{item.label}</button>)}
          <button onClick={() => { setSuccess("false"); setEvent(""); }} className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-100">Ver falhas</button>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-white">Ações rápidas</p><p className="text-xs text-zinc-500">Limpezas exigem confirmação e usam escopos seguros.</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setCleanupTarget({ scope: "tests", label: "Limpar testes", description: "Remove somente logs gerados pelo botão de teste." })} className="inline-flex items-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/15"><Trash2 size={14} /> Limpar testes</button>
            <button onClick={() => setCleanupTarget({ scope: "failed", label: "Limpar falhas", description: "Remove somente logs que falharam." })} className="inline-flex items-center gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 hover:bg-rose-500/15"><Trash2 size={14} /> Limpar falhas</button>
            {endpoint ? <button onClick={() => setCleanupTarget({ scope: "endpoint", label: "Limpar esta integração", description: "Remove todos os logs da integração selecionada." })} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"><Trash2 size={14} /> Limpar integração</button> : null}
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
            const phone = getLogPhone(log);
            const email = getLogEmail(log);
            const name = getLogName(log);
            return (
              <article key={log.id} className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${log.success ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>{log.success ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{log.success ? "Sucesso" : "Falha"}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400">{test ? "Teste" : "Produção"}</span>
                      <h2 className="text-sm font-semibold text-white">{getWebhookEventLabel(log.event)}</h2>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><Clock3 size={13} /> {formatDate(log.created_at)} · HTTP {log.status} · {log.duration_ms}ms · tentativa {(log.retry_attempt ?? 0) + 1}</p>
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500"><Webhook size={13} /> Endpoint</p><p className="truncate text-sm text-zinc-200">{log.endpoint?.name ?? log.endpoint_id}</p></div>
                      <button onClick={() => void copy(phone)} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left hover:bg-white/[0.04]"><p className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500"><Phone size={13} /> Telefone</p><p className="truncate text-sm text-zinc-200">{phone || "Não informado"}</p></button>
                      <button onClick={() => void copy(email)} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-left hover:bg-white/[0.04]"><p className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500"><Mail size={13} /> E-mail</p><p className="truncate text-sm text-zinc-200">{email || "Não informado"}</p></button>
                    </div>
                    {name ? <p className="mt-2 text-xs text-zinc-500">Contato: <span className="text-zinc-300">{name}</span></p> : null}
                    {log.error_message ? <p className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"><ShieldAlert size={14} /> {log.error_message}</p> : null}
                  </div>
                  <button disabled={retrying === log.id || log.success} onClick={() => void retry(log.id)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">{retrying === log.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reenviar</button>
                </div>
                <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
                  <summary className="cursor-pointer text-sm text-cyan-300">Ver detalhes técnicos</summary>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <button onClick={() => void copy(log.delivery_id)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"><Copy size={12} /> Delivery ID</button>
                    <button onClick={() => void copy(JSON.stringify(log.request_body, null, 2))} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-2 py-1 text-zinc-300 hover:bg-white/5"><Copy size={12} /> Payload</button>
                  </div>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify({ delivery_id: log.delivery_id, endpoint: log.endpoint, payload: log.request_body, response: log.response_body, headers: log.request_headers, error: log.error_message }, null, 2)}</pre>
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
