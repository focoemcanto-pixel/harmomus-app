"use client";
import { Copy, Plus, Webhook } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WEBHOOK_EVENTS, type WebhookEndpoint } from "@/types/webhooks";

export function WebhookCenter() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [selectedEvent, setSelectedEvent] = useState(WEBHOOK_EVENTS[0]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", url: "", environment: "production", retry_enabled: true, retry_attempts: 3, events: [WEBHOOK_EVENTS[0]] as string[] });

  const stats = useMemo(() => ({ active: endpoints.filter((e) => e.active).length, events: endpoints.reduce((acc, e) => acc + e.events.length, 0), deliveries: endpoints.filter((e) => e.last_triggered_at).length }), [endpoints]);

  async function loadEndpoints() { const res = await fetch("/api/admin/webhooks/endpoints"); const json = await res.json(); setEndpoints(json.data ?? []); setLoading(false); }
  useEffect(() => { void loadEndpoints(); }, []);

  async function createEndpoint() { await fetch("/api/admin/webhooks/endpoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); await loadEndpoints(); }
  async function testEndpoint(endpointId: string) { await fetch("/api/admin/webhooks/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpointId, event: selectedEvent }) }); await loadEndpoints(); }

  return <section className="space-y-6"><div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-zinc-950 to-violet-950/30 p-8"><h1 className="text-4xl font-bold text-white">Central de Webhooks</h1><p className="text-zinc-300">Gerencie endpoints, testes e entregas com padrão enterprise.</p><div className="mt-4 grid grid-cols-3 gap-3 text-sm"><div className="rounded-xl bg-black/30 p-3">Ativos: {stats.active}</div><div className="rounded-xl bg-black/30 p-3">Eventos: {stats.events}</div><div className="rounded-xl bg-black/30 p-3">Entregas: {stats.deliveries}</div></div></div>
  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"><h2 className="mb-3 flex items-center gap-2 text-white"><Plus size={16}/>Novo endpoint</h2><div className="grid gap-3 md:grid-cols-2"><input className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" placeholder="Nome" value={form.name} onChange={(e)=>setForm((f)=>({...f,name:e.target.value}))}/><input className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-white" placeholder="URL" value={form.url} onChange={(e)=>setForm((f)=>({...f,url:e.target.value}))}/></div><button onClick={createEndpoint} className="mt-3 rounded-xl bg-violet-600 px-4 py-2 text-sm text-white">Salvar endpoint</button></div>
  <div className="grid gap-4">{loading ? <div className="animate-pulse rounded-2xl border border-zinc-800 p-6 text-zinc-400">Carregando...</div> : endpoints.map((endpoint)=><article key={endpoint.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-white">{endpoint.name}</h3><p className="text-sm text-zinc-400">{endpoint.url}</p></div><span className="rounded-full border px-3 py-1 text-xs text-cyan-300">{endpoint.environment === "production" ? "LIVE" : "TEST"}</span></div><div className="mt-3 flex gap-2"><select className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm" value={selectedEvent} onChange={(e)=>setSelectedEvent(e.target.value as typeof selectedEvent)}>{WEBHOOK_EVENTS.map((event)=><option key={event}>{event}</option>)}</select><button onClick={()=>testEndpoint(endpoint.id)} className="rounded-lg border border-zinc-600 px-3 py-1 text-sm text-zinc-100">Testar</button><a href="/admin/webhooks/logs" className="rounded-lg border border-zinc-600 px-3 py-1 text-sm text-zinc-100">Logs</a><button className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-1 text-sm text-zinc-100"><Copy size={14}/>Copiar payload</button><button className="inline-flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-1 text-sm text-zinc-100"><Webhook size={14}/>Ativar/Desativar</button></div></article>)}</div></section>;
}
