"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getWebhookEventLabel, type WebhookLog } from "@/types/webhooks";

export function WebhookLogsTable() {
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<WebhookLog[]>([]); const [success, setSuccess] = useState("all"); const [event, setEvent] = useState(""); const [endpoint, setEndpoint] = useState("");
  useEffect(() => {
    const endpointId = searchParams.get("endpoint_id");
    if (endpointId) setEndpoint(endpointId);
  }, [searchParams]);
  async function load() { const params = new URLSearchParams(); if (success !== "all") params.set("success", success); if (event) params.set("event", event); if (endpoint) params.set("endpoint", endpoint); const res = await fetch(`/api/admin/webhooks/logs?${params.toString()}`); const json = await res.json(); setLogs(json.data ?? []); }
  useEffect(() => { void load(); }, [success, event, endpoint]);
  async function retry(logId: string) { await fetch("/api/admin/webhooks/logs/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logId }) }); await load(); }
  return <section className="space-y-4"><h1 className="text-3xl font-bold text-white">Logs Premium de Webhooks</h1><div className="flex flex-wrap gap-2"><select value={success} onChange={(e) => setSuccess(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"><option value="all">Sucesso + Falha</option><option value="true">Somente sucesso</option><option value="false">Somente falha</option></select><input value={event} onChange={(e) => setEvent(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Filtro evento" /><input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100" placeholder="Filtro endpoint" /></div><div className="space-y-2">{logs.map((log) => <article key={log.id} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-zinc-200"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className={`mr-2 rounded-full px-2 py-1 text-xs ${log.success ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>{log.success ? "Sucesso" : "Falha"}</span><span className="text-sm">{getWebhookEventLabel(log.event)}</span></div><div className="text-xs text-zinc-500">{new Date(log.created_at).toLocaleString("pt-BR")}</div></div><div className="mt-2 text-xs text-zinc-400">Status {log.status} · {log.duration_ms}ms · tentativa {log.retry_attempt + 1}</div><details className="mt-2"><summary className="cursor-pointer text-xs text-cyan-300">Payload viewer / response viewer</summary><pre className="mt-2 overflow-auto rounded bg-black/50 p-2 text-xs">{JSON.stringify({ payload: log.request_body, response: log.response_body, headers: log.request_headers }, null, 2)}</pre></details><button onClick={() => retry(log.id)} className="mt-3 rounded-lg border border-zinc-700 px-3 py-1 text-xs">Retry webhook</button></article>)}</div></section>;
}
