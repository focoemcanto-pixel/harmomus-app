"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  Search,
  ShoppingCart,
  Sparkles,
  Users,
  Wallet,
  Webhook,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  WEBHOOK_EVENT_CATEGORIES,
  WEBHOOK_PLANS,
  getWebhookEventLabel,
  type WebhookEndpoint,
} from "@/types/webhooks";

type FormState = {
  name: string;
  url: string;
  environment: "production" | "test";
  events: string[];
  plans: string[];
  retry_enabled: boolean;
  retry_attempts: number;
};

type TestResponse = {
  ok: boolean;
  status: number;
  duration_ms: number;
  response_body: string;
  payload: Record<string, unknown>;
  delivery_id: string;
  signature: string;
};

const baseForm: FormState = {
  name: "",
  url: "",
  environment: "production",
  events: [],
  plans: [...WEBHOOK_PLANS],
  retry_enabled: true,
  retry_attempts: 3,
};

const catIcons = {
  ASSINATURAS: CreditCard,
  CHECKOUT: ShoppingCart,
  PAGAMENTOS: Wallet,
  USUÁRIOS: Users,
  PLANOS: CreditCard,
  PLATAFORMA: Sparkles,
} as const;

function summarizeUrl(url: string) {
  return url.length > 42 ? `${url.slice(0, 42)}...` : url;
}

export function WebhookCenter() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(baseForm);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ ASSINATURAS: true, CHECKOUT: true, PAGAMENTOS: true, USUÁRIOS: false, PLANOS: false, PLATAFORMA: false });
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [testEvent, setTestEvent] = useState("");
  const [testPreview, setTestPreview] = useState<Record<string, unknown> | null>(null);
  const [testHeaders, setTestHeaders] = useState<Record<string, string> | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [testPhone, setTestPhone] = useState("");

  async function loadEndpoints() {
    setLoading(true);
    const res = await fetch("/api/admin/webhooks/endpoints");
    const json = await res.json();
    setEndpoints(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadEndpoints();
  }, []);

  const filtered = useMemo(
    () =>
      endpoints.filter(
        (e) =>
          (status === "all" || (status === "active" ? e.active : !e.active)) &&
          `${e.name} ${e.url} ${e.events.join(" ")} ${e.events.map(getWebhookEventLabel).join(" ")}`
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [endpoints, q, status],
  );

  async function createEndpoint() {
    if (!form.name.trim() || !form.url.trim()) {
      setBanner({ type: "error", message: "Informe nome e URL antes de salvar." });
      return;
    }
    if (form.events.length === 0) {
      setBanner({ type: "error", message: "Selecione ao menos 1 evento." });
      return;
    }
    setSaving(true);
    setBanner(null);
    const res = await fetch("/api/admin/webhooks/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Falha ao salvar endpoint." });
      setSaving(false);
      return;
    }
    setBanner({ type: "success", message: "Webhook criado com sucesso." });
    setDrawerOpen(false);
    setForm(baseForm);
    await loadEndpoints();
    setSaving(false);
  }

  async function toggleEndpoint(endpoint: WebhookEndpoint) {
    const res = await fetch(`/api/admin/webhooks/endpoints/${endpoint.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !endpoint.active }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setBanner({ type: "error", message: json?.error ?? "Não foi possível atualizar o status." });
      return;
    }
    await loadEndpoints();
  }

  async function openTest(endpoint: WebhookEndpoint) {
    const defaultEvent = endpoint.events[0] ?? "";
    setTestingEndpoint(endpoint);
    setTestEvent(defaultEvent);
    setTestResult(null);
    setTestPhone("");
    setTestOpen(true);
    if (!defaultEvent) {
      setBanner({ type: "error", message: "Este webhook não possui eventos vinculados para teste." });
      return;
    }
    const res = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: endpoint.id, event: defaultEvent, test_phone: "5571999999999", previewOnly: true }),
    });
    const json = await res.json();
    setTestPreview(json.payload ?? null);
    setTestHeaders(json.headers ?? null);
  }

  async function refreshPreview() {
    if (!testingEndpoint || !testEvent) return;
    const res = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: testingEndpoint.id, event: testEvent, test_phone: testPhone || "5571999999999", previewOnly: true }),
    });
    const json = await res.json();
    setTestPreview(json.payload ?? null);
    setTestHeaders(json.headers ?? null);
  }

  async function sendTest() {
    if (!testingEndpoint || !testEvent) return;
    if (!testPhone.trim()) {
      setBanner({ type: "error", message: "Informe um número de teste para validar este webhook." });
      return;
    }
    setTesting(true);
    const res = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: testingEndpoint.id, event: testEvent, test_phone: testPhone }),
    });
    const json = await res.json();
    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Falha ao enviar teste." });
      setTesting(false);
      return;
    }
    setTestResult(json as TestResponse);
    setTesting(false);
    await loadEndpoints();
  }

  const eventCount = form.events.length;
  return <section className="space-y-5 text-zinc-100">{/* UI omitted for brevity in source control? no */}
    <div className="rounded-3xl border border-white/10 bg-zinc-950/65 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight">Central de Webhooks</h1><p className="text-sm text-zinc-400">Crie, teste e acompanhe entregas em um fluxo estilo Stripe/Kiwify.</p></div>
        <button onClick={() => setDrawerOpen(true)} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium hover:bg-violet-500">Criar webhook</button>
      </div>
      {banner ? <p className={`mt-4 rounded-xl px-3 py-2 text-sm ${banner.type === "success" ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-200" : "border border-rose-500/40 bg-rose-500/15 text-rose-200"}`}>{banner.message}</p> : null}
    </div>

    <div className="rounded-2xl border border-white/10 bg-zinc-950/50 p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-xl border border-zinc-700/70 bg-zinc-900/60 px-3 py-2"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, URL ou evento" className="bg-transparent text-sm outline-none" /></div><select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-zinc-700/70 bg-zinc-900/70 px-3 py-2 text-sm"><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></div>
      {loading ? <p className="py-8 text-sm text-zinc-400">Carregando endpoints...</p> : filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center"><Webhook className="mx-auto mb-3 text-zinc-500" /><p className="font-medium">Nenhum webhook cadastrado</p><p className="text-sm text-zinc-500">Crie seu primeiro endpoint para começar a receber eventos.</p></div> : <div className="space-y-3">{filtered.map((e) => <article key={e.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{e.name}</p><p className="text-sm text-zinc-400" title={e.url}>{summarizeUrl(e.url)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${e.active ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border border-zinc-600 bg-zinc-800/80 text-zinc-300"}`}>{e.active ? "Ativo" : "Inativo"}</span></div><div className="mt-3 flex flex-wrap gap-2">{e.events.map((ev) => <span key={ev} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200">{getWebhookEventLabel(ev)}</span>)}</div><div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400"><Clock3 size={12} />Último disparo: {e.last_triggered_at ? new Date(e.last_triggered_at).toLocaleString("pt-BR") : "Nunca"}</div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => void openTest(e)} className="rounded-lg border border-zinc-700/80 px-3 py-1.5 text-xs hover:bg-zinc-800">Testar</button><Link href={`/admin/webhooks/logs?endpoint_id=${e.id}`} className="rounded-lg border border-zinc-700/80 px-3 py-1.5 text-xs hover:bg-zinc-800">Logs</Link><Link href={`/admin/webhooks/${e.id}`} className="rounded-lg border border-zinc-700/80 px-3 py-1.5 text-xs hover:bg-zinc-800">Editar</Link><button onClick={() => void toggleEndpoint(e)} className="rounded-lg border border-zinc-700/80 px-3 py-1.5 text-xs hover:bg-zinc-800">{e.active ? "Desativar" : "Ativar"}</button></div></article>)}</div>}
    </div>

    {drawerOpen && <div className="fixed inset-0 z-50 bg-black/70"><aside className="absolute right-0 top-0 h-full w-full max-w-lg overflow-auto border-l border-white/10 bg-zinc-950/95 p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-semibold">Criar webhook</h2><button onClick={() => setDrawerOpen(false)} className="rounded-lg border border-zinc-700 p-2"><X size={16} /></button></div><div className="space-y-4"><input className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm" placeholder="Nome da integração" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /><input className="w-full rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-sm" placeholder="URL do Webhook" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
      <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300">Secret/token será gerado automaticamente pelo Harmomus ao salvar.</div>
      <p className="text-xs text-zinc-400">Eventos selecionados: {eventCount}</p>
      <div className="space-y-3">{Object.entries(WEBHOOK_EVENT_CATEGORIES).map(([cat, events]) => { const Icon = catIcons[cat as keyof typeof catIcons] ?? Sparkles; const isOpen = openCats[cat] ?? false; return <div key={cat} className="rounded-xl border border-white/10 bg-zinc-900/30"><button onClick={() => setOpenCats((s) => ({ ...s, [cat]: !isOpen }))} className="flex w-full items-center justify-between px-3 py-2"><div className="flex items-center gap-2 text-sm font-medium"><Icon size={14} className="text-violet-300" />{cat}</div>{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>{isOpen && <div className="flex flex-wrap gap-2 px-3 pb-3">{events.map((ev) => { const active = form.events.includes(ev); return <button key={ev} onClick={() => setForm((f) => ({ ...f, events: active ? f.events.filter((x) => x !== ev) : [...f.events, ev] }))} className={`rounded-full border px-3 py-1.5 text-xs ${active ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border-zinc-700 bg-zinc-900/70 text-zinc-300"}`}>{active ? <Check size={12} className="mr-1 inline" /> : null}{getWebhookEventLabel(ev)}</button>; })}</div>}</div>; })}</div>
      <button disabled={saving} onClick={() => void createEndpoint()} className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold hover:bg-violet-500 disabled:opacity-70">{saving ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Salvando...</span> : "Salvar webhook"}</button></div></aside></div>}

    {testOpen && testingEndpoint ? <div className="fixed inset-0 z-50 bg-black/70"><aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l border-white/10 bg-zinc-950/95 p-7"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-semibold">Testar webhook</h2><p className="text-xs text-zinc-500">{testingEndpoint.name}</p></div><button onClick={() => setTestOpen(false)} className="rounded-lg border border-zinc-700 p-2"><X size={16} /></button></div><div className="space-y-4"><label className="block text-sm">Evento<select className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2" value={testEvent} onChange={(e) => setTestEvent(e.target.value)}>{testingEndpoint.events.map((ev) => <option key={ev} value={ev}>{getWebhookEventLabel(ev)}</option>)}</select></label><label className="block text-sm">Número para teste<input className="mt-1 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5571999999999" /></label><p className="text-xs text-zinc-500">Use DDI + DDD + número, apenas dígitos.</p><button onClick={() => void refreshPreview()} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs">Atualizar preview</button><div className="grid gap-4 md:grid-cols-2"><div><p className="mb-1 text-xs uppercase text-zinc-500">Payload enviado</p><pre className="max-h-72 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs">{JSON.stringify(testPreview, null, 2)}</pre></div><div><p className="mb-1 text-xs uppercase text-zinc-500">Headers enviados</p><pre className="max-h-72 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-xs">{JSON.stringify(testHeaders, null, 2)}</pre></div></div><button disabled={testing} onClick={() => void sendTest()} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold hover:bg-cyan-500 disabled:opacity-70">{testing ? "Enviando..." : "Enviar teste"}</button>{testResult ? <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm"><p><strong>Status HTTP:</strong> {testResult.status}</p><p><strong>Duração:</strong> {testResult.duration_ms}ms</p><p><strong>Delivery ID:</strong> {testResult.delivery_id}</p><p><strong>Resposta do destino:</strong></p><pre className="max-h-48 overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-xs">{testResult.response_body || "(sem corpo)"}</pre></div> : null}<Link href={`/admin/webhooks/logs?endpoint_id=${testingEndpoint.id}`} className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:text-cyan-200">Ver logs deste endpoint <ExternalLink size={13} /></Link></div></aside></div> : null}
  </section>;
}
