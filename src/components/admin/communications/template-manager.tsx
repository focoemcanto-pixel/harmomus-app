"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Save, Sparkles } from "lucide-react";

type TemplateItem = {
  id: string;
  created_at: string;
  name: string;
  channel: "whatsapp" | "email" | "both";
  category: string | null;
  subject: string | null;
  body: string;
  media_url: string | null;
  active: boolean;
};

export function TemplateManager() {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [name, setName] = useState("Você tentou acessar um kit Premium");
  const [channel, setChannel] = useState<"whatsapp" | "email" | "both">("both");
  const [category, setCategory] = useState("Upgrade");
  const [subject, setSubject] = useState("Seu kit Premium está pronto");
  const [body, setBody] = useState("Olá {{nome}}, vimos seu interesse em um kit Premium. Ative seu acesso hoje e continue seus estudos: {{link}}");
  const [mediaUrl, setMediaUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  async function loadTemplates() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/comunicacao/templates", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao carregar templates.");
      setItems(json?.data ?? []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao carregar templates.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function saveTemplate() {
    if (!name.trim()) return setStatus("Informe o nome do template.");
    if (!body.trim()) return setStatus("Informe o corpo do template.");

    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/comunicacao/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, channel, category, subject, body, media_url: mediaUrl }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(json?.error ?? "Falha ao salvar template.");
      setItems((current) => [json.data, ...current]);
      setStatus("Template salvo em marketing_templates.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Falha ao salvar template.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/20 bg-violet-500/10 text-violet-200"><FileText size={20} /></span>
          <div><h3 className="text-lg font-semibold text-white">Novo template</h3><p className="text-sm text-slate-400">Modelo persistente para WhatsApp, e-mail ou ambos.</p></div>
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm text-slate-300">Nome<input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-300">Canal<select value={channel} onChange={(e) => setChannel(e.target.value as "whatsapp" | "email" | "both")} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="whatsapp">WhatsApp</option><option value="email">E-mail</option><option value="both">Ambos</option></select></label>
            <label className="text-sm text-slate-300">Categoria<select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option>Upgrade</option><option>Recuperação</option><option>Engajamento</option><option>Novos kits</option><option>Avisos</option><option>Retenção</option></select></label>
          </div>
          <label className="block text-sm text-slate-300">Assunto<input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <label className="block text-sm text-slate-300">Corpo<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-100"><Sparkles size={15} /> Exemplos comerciais</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {["Você tentou acessar um kit Premium", "Seu acesso pode ser ativado hoje", "Volte para continuar seus estudos", "Novos kits disponíveis", "Seu pagamento não foi confirmado"].map((example) => (
                <button key={example} type="button" onClick={() => setName(example)} className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-slate-200 hover:border-cyan-300/40">{example}</button>
              ))}
            </div>
          </div>
          <label className="block text-sm text-slate-300">Media URL<input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white" /></label>
          <button onClick={saveTemplate} disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-60">{isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {isSaving ? "Salvando..." : "Salvar template"}</button>
          {status ? <p className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">{status}</p> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <h3 className="text-lg font-semibold text-white">Templates salvos por categoria</h3>
        {isLoading ? <p className="mt-4 text-sm text-slate-400">Carregando...</p> : null}
        {!isLoading && !items.length ? <p className="mt-4 rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">Nenhum template salvo ainda.</p> : null}
        <div className="mt-4 grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-semibold text-white">{item.name}</p><p className="text-xs text-slate-400">{item.channel} · {item.category || "sem categoria"}</p></div>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">{item.active ? "ativo" : "inativo"}</span>
              </div>
              {item.subject ? <p className="mt-3 text-sm font-medium text-cyan-100">{item.subject}</p> : null}
              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-sm leading-6 text-slate-200">{item.body}</pre>
              {item.media_url ? <a className="mt-2 block truncate text-sm text-cyan-200" href={item.media_url} target="_blank" rel="noreferrer">{item.media_url}</a> : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
