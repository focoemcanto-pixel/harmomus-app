"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getWebhookEventLabel, type WebhookEndpoint, type WebhookLog } from "@/types/webhooks";

type TestResult = {
  ok?: boolean;
  status?: number;
  duration_ms?: number;
  response_body?: string;
  error?: string;
};

function maskMiddle(value?: string | null, visibleStart = 18, visibleEnd = 6) {
  if (!value) return "Não informado";
  if (value.length <= visibleStart + visibleEnd) return value;
  return `${value.slice(0, visibleStart)}••••••${value.slice(-visibleEnd)}`;
}

function getStatusTone(success?: boolean) {
  if (success) return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  return "border-rose-400/30 bg-rose-500/10 text-rose-200";
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR");
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export default function WebhookEndpointDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [event, setEvent] = useState("");
  const [testPhone, setTestPhone] = useState("5571999999999");
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function loadEndpoint() {
    if (!params?.id) return;
    setLoading(true);
    setBanner(null);

    const res = await fetch(`/api/admin/webhooks/endpoints/${params.id}`);
    const json = await res.json().catch(() => null);

    if (!res.ok || !json?.data) {
      setBanner({ type: "error", message: json?.error ?? "Não foi possível carregar este webhook." });
      setLoading(false);
      return;
    }

    setEndpoint(json.data);
    setLogs(json.logs ?? []);
    setEvent(json.data?.events?.[0] ?? "");
    setLoading(false);
  }

  useEffect(() => {
    void loadEndpoint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((log) => log.success).length;
    const failed = total - success;
    const successRate = total ? Math.round((success / total) * 100) : 0;
    const averageMs = total ? Math.round(logs.reduce((sum, log) => sum + Number(log.duration_ms ?? 0), 0) / total) : 0;
    return { total, success, failed, successRate, averageMs };
  }, [logs]);

  async function previewPayload() {
    if (!endpoint || !event) return;
    setBanner(null);
    setResult(null);

    const phone = normalizePhone(testPhone);
    if (phone.length < 12) {
      setBanner({ type: "error", message: "Informe um WhatsApp de teste com DDI + DDD + número." });
      return;
    }

    const response = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: endpoint.id, event, test_phone: phone, previewOnly: true }),
    });
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      setBanner({ type: "error", message: json?.error ?? "Não foi possível pré-visualizar o teste." });
      return;
    }

    setPreview(json.payload ?? null);
    setBanner({ type: "success", message: "Prévia gerada. Revise apenas se precisar validar campos enviados." });
  }

  async function runTest() {
    if (!endpoint || !event) return;
    setTesting(true);
    setBanner(null);
    setResult(null);

    const phone = normalizePhone(testPhone);
    if (phone.length < 12) {
      setBanner({ type: "error", message: "Informe um WhatsApp de teste com DDI + DDD + número." });
      setTesting(false);
      return;
    }

    const response = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: endpoint.id, event, test_phone: phone }),
    });
    const json = await response.json().catch(() => null);

    if (!response.ok) {
      setBanner({ type: "error", message: json?.error ?? "Falha ao enviar o teste." });
      setTesting(false);
      return;
    }

    setResult(json as TestResult);
    setBanner({
      type: json?.ok ? "success" : "error",
      message: json?.ok ? "Webhook entregue com sucesso no LabMessage." : "O endpoint respondeu com falha. Veja o retorno abaixo.",
    });
    await loadEndpoint();
    setTesting(false);
  }

  async function copyEndpointUrl() {
    if (!endpoint?.url) return;
    await navigator.clipboard.writeText(endpoint.url);
    setBanner({ type: "success", message: "URL copiada." });
  }

  if (loading) {
    return (
      <section className="flex min-h-[50vh] items-center justify-center text-zinc-300">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/70 px-5 py-4">
          <Loader2 className="animate-spin text-violet-300" size={18} /> Carregando webhook...
        </div>
      </section>
    );
  }

  if (!endpoint) {
    return (
      <section className="space-y-4 text-zinc-100">
        <button onClick={() => router.back()} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-rose-100">Webhook não encontrado.</div>
      </section>
    );
  }

  return (
    <section className="space-y-5 text-zinc-100">
      <div className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_32%),rgba(9,9,11,0.82)] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={() => router.push("/admin/webhooks")} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-zinc-300 hover:bg-white/[0.07]">
            <ArrowLeft size={16} /> Voltar para webhooks
          </button>
          <Link href="/admin/webhooks/logs" className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/15">
            Ver histórico geral <ExternalLink size={15} />
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-200/80">Webhook conectado</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">{endpoint.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Painel seguro para validar disparos, acompanhar entregas e confirmar se os gatilhos estão chegando na plataforma externa.</p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${endpoint.active ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border border-zinc-600 bg-zinc-800 text-zinc-300"}`}>
            {endpoint.active ? "Ativo" : "Inativo"}
          </span>
        </div>
      </div>

      {banner ? (
        <div className={`rounded-2xl px-4 py-3 text-sm ${banner.type === "success" ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
          {banner.message}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Saúde</p>
          <p className="mt-2 text-2xl font-semibold">{stats.successRate}%</p>
          <p className="text-xs text-zinc-500">Taxa de sucesso</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Entregas</p>
          <p className="mt-2 text-2xl font-semibold">{stats.total}</p>
          <p className="text-xs text-zinc-500">Últimos registros</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Velocidade</p>
          <p className="mt-2 text-2xl font-semibold">{stats.averageMs || 0}ms</p>
          <p className="text-xs text-zinc-500">Média recente</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Último disparo</p>
          <p className="mt-2 text-sm font-medium text-zinc-200">{formatDate(endpoint.last_triggered_at)}</p>
          <p className="text-xs text-zinc-500">Monitoramento operacional</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Validar gatilho</h2>
              <p className="mt-1 text-sm text-zinc-400">Use este bloco para testar se o evento selecionado aciona corretamente o fluxo do LabMessage.</p>
            </div>
            <ShieldCheck className="text-violet-300" size={22} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_0.8fr]">
            <label className="space-y-2 text-sm">
              <span className="text-zinc-300">Gatilho</span>
              <select className="w-full rounded-2xl border border-white/10 bg-zinc-900/80 px-3 py-3 outline-none focus:border-violet-400/60" value={event} onChange={(e) => setEvent(e.target.value)}>
                {endpoint.events.map((ev) => <option key={ev} value={ev}>{getWebhookEventLabel(ev)}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="text-zinc-300">WhatsApp de teste</span>
              <input className="w-full rounded-2xl border border-white/10 bg-zinc-900/80 px-3 py-3 outline-none focus:border-violet-400/60" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5571999999999" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={previewPayload} disabled={!event || testing} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium hover:bg-white/[0.07] disabled:opacity-50">
              <RefreshCw size={16} /> Conferir dados
            </button>
            <button onClick={runTest} disabled={!event || testing} className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 hover:bg-violet-500 disabled:opacity-50">
              {testing ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />} Enviar teste real
            </button>
          </div>

          {result ? (
            <div className={`mt-5 rounded-2xl border p-4 ${getStatusTone(Boolean(result.ok))}`}>
              <div className="flex items-center gap-2 font-medium">
                {result.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                {result.ok ? "Entrega confirmada" : "Entrega não confirmada"}
              </div>
              <p className="mt-1 text-sm opacity-90">Status {result.status ?? 0} · {result.duration_ms ?? 0}ms</p>
              {result.response_body ? <p className="mt-3 rounded-xl bg-black/25 p-3 text-xs opacity-90">{result.response_body.slice(0, 500)}</p> : null}
            </div>
          ) : null}

          {preview ? (
            <details className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4">
              <summary className="cursor-pointer text-sm text-zinc-300">Ver dados que serão enviados</summary>
              <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify(preview, null, 2)}</pre>
            </details>
          ) : null}
        </div>

        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5">
          <h2 className="text-lg font-semibold">Configuração segura</h2>
          <p className="mt-1 text-sm text-zinc-400">Informações sensíveis ficam ocultas por padrão para evitar exposição na operação diária.</p>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">URL de entrega</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="truncate text-sm text-zinc-200" title={endpoint.url}>{maskMiddle(endpoint.url, 32, 10)}</p>
                <button onClick={copyEndpointUrl} className="rounded-xl border border-white/10 p-2 text-zinc-300 hover:bg-white/5" title="Copiar URL"><Copy size={15} /></button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Token de assinatura</p>
              <p className="mt-2 truncate text-sm text-zinc-200">{maskMiddle(endpoint.secret, 14, 8)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Gatilhos ativos</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {endpoint.events.map((ev) => <span key={ev} className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-100">{getWebhookEventLabel(ev)}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Últimas entregas</h2>
            <p className="text-sm text-zinc-400">Histórico resumido. Payload completo fica recolhido para não poluir a operação.</p>
          </div>
          <button onClick={() => void loadEndpoint()} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5">
            <RefreshCw size={15} /> Atualizar
          </button>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-400">Nenhuma entrega registrada ainda.</div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <article key={log.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-100">{getWebhookEventLabel(log.event)}</p>
                    <p className="mt-1 flex items-center gap-2 text-xs text-zinc-500"><Clock3 size={13} /> {formatDate(log.created_at)} · {log.duration_ms}ms</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${getStatusTone(log.success)}`}>{log.success ? "Sucesso" : "Falha"}</span>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-cyan-300">Ver detalhes técnicos</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify({ payload: log.request_body, response: log.response_body, headers: log.request_headers, error: log.error_message }, null, 2)}</pre>
                </details>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
