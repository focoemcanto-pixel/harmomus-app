"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  CreditCard,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  TestTube2,
  Trash2,
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
  accepted?: boolean;
  confirmed?: boolean;
  status: number;
  duration_ms: number;
  response_body: string;
  response_url?: string;
  normalized_phone?: string;
  payload: Record<string, unknown>;
  delivery_id: string;
  signature: string;
  diagnostic?: string;
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
  "ASSINATURAS POR PLANO": CreditCard,
} as const;

function summarizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.length > 42 ? `${url.slice(0, 42)}...` : url;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR");
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function WebhookCenter() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WebhookEndpoint | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<FormState>(baseForm);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({ ASSINATURAS: true, "ASSINATURAS POR PLANO": true, CHECKOUT: true, PAGAMENTOS: true, USUÁRIOS: false, PLANOS: false, PLATAFORMA: false });
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState<WebhookEndpoint | null>(null);
  const [testEvent, setTestEvent] = useState("");
  const [testPreview, setTestPreview] = useState<Record<string, unknown> | null>(null);
  const [testHeaders, setTestHeaders] = useState<Record<string, string> | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [testPhone, setTestPhone] = useState("5571999999999");

  async function loadEndpoints() {
    setLoading(true);
    const res = await fetch("/api/admin/webhooks/endpoints");
    const json = await res.json().catch(() => null);
    setEndpoints(json?.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadEndpoints();
  }, []);

  const stats = useMemo(() => {
    const total = endpoints.length;
    const active = endpoints.filter((e) => e.active).length;
    const events = endpoints.reduce((sum, e) => sum + (Array.isArray(e.events) ? e.events.length : 0), 0);
    const lastTriggered = endpoints
      .map((e) => e.last_triggered_at)
      .filter(Boolean)
      .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0] ?? null;
    return { total, active, events, lastTriggered };
  }, [endpoints]);

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
    if (!form.name.trim() || !form.url.trim()) return setBanner({ type: "error", message: "Informe nome e URL antes de salvar." });
    if (form.events.length === 0) return setBanner({ type: "error", message: "Selecione ao menos 1 gatilho." });

    setSaving(true);
    setBanner(null);
    const res = await fetch("/api/admin/webhooks/endpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Falha ao salvar integração." });
      setSaving(false);
      return;
    }
    setBanner({ type: "success", message: "Integração criada com sucesso." });
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
    setBanner({ type: "success", message: endpoint.active ? "Integração desativada." : "Integração ativada." });
    await loadEndpoints();
  }

  async function deleteEndpoint(endpoint: WebhookEndpoint) {
    setDeletingId(endpoint.id);
    setBanner(null);
    const res = await fetch(`/api/admin/webhooks/endpoints/${endpoint.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Não foi possível excluir a integração." });
      setDeletingId(null);
      return;
    }
    setBanner({ type: "success", message: `Integração ${endpoint.name} excluída com sucesso.` });
    setConfirmDelete(null);
    setDeletingId(null);
    await loadEndpoints();
  }

  async function openTest(endpoint: WebhookEndpoint) {
    const defaultEvent = endpoint.events[0] ?? "";
    setTestingEndpoint(endpoint);
    setTestEvent(defaultEvent);
    setTestResult(null);
    setTestPhone("5571999999999");
    setTestOpen(true);
    if (!defaultEvent) return setBanner({ type: "error", message: "Esta integração não possui gatilhos vinculados para teste." });
    const res = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: endpoint.id, event: defaultEvent, test_phone: "5571999999999", previewOnly: true }),
    });
    const json = await res.json().catch(() => null);
    setTestPreview(json?.payload ?? null);
    setTestHeaders(json?.headers ?? null);
  }

  async function refreshPreview() {
    if (!testingEndpoint || !testEvent) return;
    const phone = normalizePhone(testPhone || "5571999999999");
    const res = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: testingEndpoint.id, event: testEvent, test_phone: phone, previewOnly: true }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return setBanner({ type: "error", message: json?.error ?? "Não foi possível gerar a prévia." });
    setTestPreview(json?.payload ?? null);
    setTestHeaders(json?.headers ?? null);
  }

  async function sendTest() {
    if (!testingEndpoint || !testEvent) return;
    const phone = normalizePhone(testPhone);
    if (phone.length < 12) return setBanner({ type: "error", message: "Informe um número com DDI + DDD + telefone." });
    setTesting(true);
    setTestResult(null);
    const res = await fetch("/api/admin/webhooks/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint_id: testingEndpoint.id, event: testEvent, test_phone: phone }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setBanner({ type: "error", message: json?.error ?? "Falha ao testar integração." });
      setTesting(false);
      return;
    }
    setTestResult(json as TestResponse);
    setTesting(false);
    await loadEndpoints();
  }

  const eventCount = form.events.length;

  return (
    <section className="space-y-6 text-zinc-100">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.20),transparent_34%),rgba(9,9,11,0.86)] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.34em] text-amber-200/80">Automações externas</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">Central de Webhooks</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Conecte Harmomus ao LabMessage, Make, Zapier e outras plataformas. A operação fica simples; os detalhes técnicos ficam recolhidos.</p>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/40 hover:bg-violet-500"><Plus size={16} /> Nova integração</button>
        </div>
        {banner ? <div className={`mt-5 rounded-2xl px-4 py-3 text-sm ${banner.type === "success" ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>{banner.message}</div> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Integrações</p><p className="mt-3 text-3xl font-semibold">{stats.total}</p><p className="text-xs text-zinc-500">Cadastradas</p></div>
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5"><p className="text-xs uppercase tracking-[0.22em] text-emerald-300/70">Ativas</p><p className="mt-3 text-3xl font-semibold text-emerald-100">{stats.active}</p><p className="text-xs text-emerald-200/60">Prontas para receber gatilhos</p></div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Gatilhos</p><p className="mt-3 text-3xl font-semibold">{stats.events}</p><p className="text-xs text-zinc-500">Eventos vinculados</p></div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-5"><p className="text-xs uppercase tracking-[0.22em] text-zinc-500">Último disparo</p><p className="mt-3 text-sm font-semibold text-zinc-200">{formatDate(stats.lastTriggered)}</p><p className="text-xs text-zinc-500">Monitoramento geral</p></div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-zinc-950/55 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5"><Search size={16} className="text-zinc-500" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar integração, URL ou gatilho" className="w-72 max-w-[70vw] bg-transparent text-sm outline-none placeholder:text-zinc-600" /></div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-2xl border border-white/10 bg-zinc-900/70 px-3 py-2.5 text-sm outline-none"><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select>
          </div>
          <Link href="/admin/webhooks/logs" className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-sm text-cyan-100 hover:bg-cyan-500/15">Histórico geral <ExternalLink size={15} /></Link>
        </div>

        <div className="mt-4">
          {loading ? <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm text-zinc-400"><Loader2 size={16} className="animate-spin" /> Carregando integrações...</div> : filtered.length === 0 ? <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center"><Webhook className="mx-auto mb-3 text-zinc-500" /><p className="font-medium">Nenhuma integração encontrada</p><p className="mt-1 text-sm text-zinc-500">Crie uma integração para acionar automações externas.</p></div> : <div className="grid gap-3 xl:grid-cols-2">{filtered.map((endpoint) => <article key={endpoint.id} className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 transition hover:border-violet-400/30 hover:bg-white/[0.04]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-semibold text-white">{endpoint.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs ${endpoint.active ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border border-zinc-600 bg-zinc-800/80 text-zinc-300"}`}>{endpoint.active ? "Ativa" : "Inativa"}</span></div><p className="mt-1 text-sm text-zinc-500" title={endpoint.url}>{summarizeUrl(endpoint.url)}</p></div><ShieldCheck size={20} className={endpoint.active ? "text-emerald-300" : "text-zinc-600"} /></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Gatilhos</p><p className="mt-1 text-xl font-semibold">{endpoint.events.length}</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Retry</p><p className="mt-1 text-xl font-semibold">{endpoint.retry_enabled ? endpoint.retry_attempts : 0}x</p></div><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Último envio</p><p className="mt-1 text-xs font-medium text-zinc-300">{formatDate(endpoint.last_triggered_at)}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{endpoint.events.slice(0, 5).map((ev) => <span key={ev} className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-100">{getWebhookEventLabel(ev)}</span>)}{endpoint.events.length > 5 ? <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400">+{endpoint.events.length - 5}</span> : null}</div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void openTest(endpoint)} className="inline-flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-500/15"><TestTube2 size={14} /> Testar</button><Link href={`/admin/webhooks/${endpoint.id}`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"><Settings2 size={14} /> Abrir</Link><Link href={`/admin/webhooks/logs?endpoint_id=${endpoint.id}`} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"><Clock3 size={14} /> Logs</Link><button onClick={() => void toggleEndpoint(endpoint)} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5">{endpoint.active ? "Desativar" : "Ativar"}</button><button onClick={() => setConfirmDelete(endpoint)} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100 hover:bg-rose-500/15"><Trash2 size={14} /> Excluir</button></div></article>)}</div>}
        </div>
      </div>

      {drawerOpen && <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"><aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l border-white/10 bg-zinc-950 p-7 shadow-2xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.24em] text-violet-300">Nova integração</p><h2 className="mt-1 text-2xl font-semibold">Conectar automação</h2><p className="mt-1 text-sm text-zinc-500">Cadastre a URL do LabMessage ou outra plataforma e escolha quais gatilhos ela receberá.</p></div><button onClick={() => setDrawerOpen(false)} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><X size={16} /></button></div><div className="space-y-4"><label className="block text-sm"><span className="text-zinc-300">Nome da integração</span><input className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm outline-none focus:border-violet-400/60" placeholder="Ex.: LabMessage - Boas-vindas" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></label><label className="block text-sm"><span className="text-zinc-300">URL do webhook</span><input className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900/70 px-4 py-3 text-sm outline-none focus:border-violet-400/60" placeholder="https://..." value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} /></label><div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100/90">O token de assinatura é gerado automaticamente. Ele fica disponível na página da integração.</div><div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] p-4"><div><p className="font-medium">Gatilhos selecionados</p><p className="text-sm text-zinc-500">Escolha apenas eventos que essa automação precisa receber.</p></div><span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-100">{eventCount}</span></div><div className="space-y-3">{Object.entries(WEBHOOK_EVENT_CATEGORIES).map(([cat, events]) => { const Icon = catIcons[cat as keyof typeof catIcons] ?? Sparkles; const isOpen = openCats[cat] ?? false; return <div key={cat} className="rounded-2xl border border-white/10 bg-zinc-900/35"><button onClick={() => setOpenCats((s) => ({ ...s, [cat]: !isOpen }))} className="flex w-full items-center justify-between px-4 py-3"><div className="flex items-center gap-2 text-sm font-medium"><Icon size={15} className="text-violet-300" />{cat}</div>{isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>{isOpen && <div className="flex flex-wrap gap-2 px-4 pb-4">{events.map((ev) => { const active = form.events.includes(ev); return <button key={ev} onClick={() => setForm((f) => ({ ...f, events: active ? f.events.filter((x) => x !== ev) : [...f.events, ev] }))} className={`rounded-full border px-3 py-1.5 text-xs ${active ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200" : "border-zinc-700 bg-zinc-900/70 text-zinc-300 hover:bg-white/5"}`}>{active ? <Check size={12} className="mr-1 inline" /> : null}{getWebhookEventLabel(ev)}</button>; })}</div>}</div>; })}</div><button disabled={saving} onClick={() => void createEndpoint()} className="w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-70">{saving ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Salvando...</span> : "Salvar integração"}</button></div></aside></div>}

      {testOpen && testingEndpoint ? <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"><aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-auto border-l border-white/10 bg-zinc-950 p-7 shadow-2xl"><div className="mb-6 flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Teste de gatilho</p><h2 className="mt-1 text-2xl font-semibold">{testingEndpoint.name}</h2><p className="mt-1 text-sm text-zinc-500">Simula um evento real para acionar o fluxo configurado na plataforma externa.</p></div><button onClick={() => setTestOpen(false)} className="rounded-xl border border-white/10 p-2 hover:bg-white/5"><X size={16} /></button></div><div className="space-y-4"><label className="block text-sm">Gatilho<select className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" value={testEvent} onChange={(e) => setTestEvent(e.target.value)}>{testingEndpoint.events.map((ev) => <option key={ev} value={ev}>{getWebhookEventLabel(ev)}</option>)}</select></label><label className="block text-sm">WhatsApp de teste<input className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 outline-none" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="5571999999999" /></label><div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100/90">Use um número que possa receber mensagens da instância do LabMessage. Se um contato específico não gerar log, verifique bloqueio, descadastro ou regras internas do fluxo.</div><div className="flex flex-wrap gap-2"><button onClick={() => void refreshPreview()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs hover:bg-white/5"><Search size={14} /> Conferir dados</button><button disabled={testing} onClick={() => void sendTest()} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-70">{testing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Enviar teste real</button></div>{testResult ? <div className={`rounded-2xl border p-4 text-sm ${testResult.ok ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}><p className="font-medium">{testResult.ok ? "Webhook aceito pelo endpoint" : "Entrega não confirmada"}</p><p className="mt-1 text-xs opacity-90">Status {testResult.status} · {testResult.duration_ms}ms · telefone {testResult.normalized_phone ?? "não informado"}</p>{testResult.diagnostic ? <p className="mt-2 text-xs opacity-90">{testResult.diagnostic}</p> : null}{testResult.response_body ? <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-black/30 p-3 text-xs">{testResult.response_body}</pre> : null}</div> : null}<details className="rounded-2xl border border-white/10 bg-black/25 p-4"><summary className="cursor-pointer text-sm text-zinc-300">Dados técnicos enviados</summary><div className="mt-3 grid gap-4 md:grid-cols-2"><pre className="max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify(testPreview, null, 2)}</pre><pre className="max-h-72 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-zinc-300">{JSON.stringify(testHeaders, null, 2)}</pre></div></details><Link href={`/admin/webhooks/logs?endpoint_id=${testingEndpoint.id}`} className="inline-flex items-center gap-1 text-sm text-cyan-300 hover:text-cyan-200">Ver logs desta integração <ExternalLink size={13} /></Link></div></aside></div> : null}

      {confirmDelete ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-3xl border border-rose-400/25 bg-zinc-950 p-6 shadow-2xl"><div className="flex items-start gap-3"><div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-rose-200"><Trash2 size={20} /></div><div><h2 className="text-xl font-semibold text-white">Excluir integração?</h2><p className="mt-2 text-sm leading-relaxed text-zinc-400">Isso removerá <strong className="text-zinc-100">{confirmDelete.name}</strong> e seus logs relacionados. Essa ação não pode ser desfeita.</p></div></div><div className="mt-6 flex flex-wrap justify-end gap-2"><button onClick={() => setConfirmDelete(null)} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">Cancelar</button><button disabled={deletingId === confirmDelete.id} onClick={() => void deleteEndpoint(confirmDelete)} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-70">{deletingId === confirmDelete.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir definitivamente</button></div></div></div> : null}
    </section>
  );
}
