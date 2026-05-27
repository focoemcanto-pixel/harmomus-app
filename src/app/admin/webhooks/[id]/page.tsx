"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { WEBHOOK_EVENTS, getWebhookEventLabel, type WebhookEndpoint, type WebhookLog } from "@/types/webhooks";

export default function WebhookEndpointDetailsPage() {
  const params = useParams<{ id: string }>();
  const [endpoint, setEndpoint] = useState<WebhookEndpoint | null>(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [event, setEvent] = useState(WEBHOOK_EVENTS[0]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { void (async () => { if (!params?.id) return; const res = await fetch(`/api/admin/webhooks/endpoints/${params.id}`); const j = await res.json(); setEndpoint(j.data); setLogs(j.logs ?? []); })(); }, [params]);
  const successRate = useMemo(() => logs.length ? Math.round((logs.filter((l) => l.success).length / logs.length) * 100) : 0, [logs]);
  async function previewPayload() { const r = await fetch("/api/admin/webhooks/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpointId: endpoint?.id, event, previewOnly: true }) }); const j = await r.json(); setPreview(j.payload); }
  async function runTest() { const r = await fetch("/api/admin/webhooks/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpointId: endpoint?.id, event }) }); const j = await r.json(); setResult(j); }
  if (!endpoint) return <div className="p-6 text-zinc-300">Carregando...</div>;
  return <section className="space-y-4 text-zinc-100"><h1 className="text-2xl font-bold">{endpoint.name}</h1><div className="grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">Endpoint: {endpoint.url}</div><div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">Secret: {endpoint.secret}</div><div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">Taxa sucesso: {successRate}%</div></div>
  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><h2 className="mb-2 font-semibold">Teste webhook</h2><div className="flex gap-2"><select className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1" value={event} onChange={(e) => setEvent(e.target.value)}>{WEBHOOK_EVENTS.map((ev) => <option key={ev} value={ev}>{getWebhookEventLabel(ev)}</option>)}</select><button onClick={previewPayload} className="rounded-lg border border-zinc-700 px-3 py-1">Pré-visualizar JSON</button><button onClick={runTest} className="rounded-lg bg-violet-600 px-3 py-1">Enviar teste</button></div>{preview && <pre className="mt-3 overflow-auto rounded bg-black/60 p-3 text-xs">{JSON.stringify(preview, null, 2)}</pre>}{result && <pre className="mt-3 overflow-auto rounded bg-black/60 p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>}</div>
  <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"><h2 className="mb-3 font-semibold">Últimas entregas</h2><div className="space-y-2">{logs.map((log) => <div key={log.id} className="rounded-lg border border-zinc-800 p-3"><div className="text-sm">{getWebhookEventLabel(log.event)} · {log.success ? "Sucesso" : "Falha"} · {log.duration_ms}ms</div><div className="text-xs text-zinc-500">{new Date(log.created_at).toLocaleString("pt-BR")}</div><details><summary className="cursor-pointer text-xs text-cyan-300">Ver payload/response</summary><pre className="mt-2 overflow-auto text-xs">{JSON.stringify({ payload: log.request_body, response: log.response_body, headers: log.request_headers }, null, 2)}</pre></details></div>)}</div></div></section>;
}
