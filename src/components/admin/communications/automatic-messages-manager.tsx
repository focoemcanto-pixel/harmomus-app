"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Edit3, Loader2, MessageCircle, RotateCcw, Send, XCircle } from "lucide-react";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  intent: string;
  channel: string;
  status: string;
  message_template: string;
  cta_url: string | null;
  cooldown_hours: number;
  metadata?: Record<string, unknown> | null;
};

type Props = {
  automations: Automation[];
  defaultTestPhone: string;
};

const VARIABLES = ["{{nome}}", "{{plano}}", "{{link}}", "{{valor}}", "{{proxima_cobranca}}"];

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function AutomaticMessagesManager({ automations: initialAutomations, defaultTestPhone }: Props) {
  const [automations, setAutomations] = useState(initialAutomations);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [testPhone, setTestPhone] = useState(defaultTestPhone);
  const [testName, setTestName] = useState("Marcos");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const grouped = useMemo(() => {
    const groups: Record<string, Automation[]> = { "Assinaturas e acesso": [], "Conversão e recuperação": [], Outros: [] };
    for (const automation of automations) {
      if (["subscription", "plan", "payment", "user"].some((prefix) => automation.trigger_event.startsWith(prefix))) groups["Assinaturas e acesso"].push(automation);
      else if (["checkout", "premium_blocked", "upgrade"].some((prefix) => automation.trigger_event.startsWith(prefix))) groups["Conversão e recuperação"].push(automation);
      else groups.Outros.push(automation);
    }
    return groups;
  }, [automations]);

  function openEditor(automation: Automation) {
    setEditing({ ...automation });
    setFeedback(null);
  }

  async function saveAutomation() {
    if (!editing) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/comunicacao/automations/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name,
          description: editing.description,
          trigger_event: editing.trigger_event,
          intent: editing.intent,
          channel: editing.channel,
          status: editing.status,
          message_template: editing.message_template,
          cta_url: editing.cta_url,
          cooldown_hours: editing.cooldown_hours,
          metadata: editing.metadata ?? {},
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar.");
      setAutomations((current) => current.map((item) => item.id === editing.id ? payload.data : item));
      setEditing(payload.data);
      setFeedback({ type: "success", message: "Mensagem salva com sucesso." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefault() {
    if (!editing) return;
    const defaultMessage = typeof editing.metadata?.default_message_template === "string" ? editing.metadata.default_message_template : "";
    const defaultCta = typeof editing.metadata?.default_cta_url === "string" ? editing.metadata.default_cta_url : null;
    if (!defaultMessage) {
      setFeedback({ type: "error", message: "Esta automação ainda não possui mensagem padrão registrada." });
      return;
    }
    setEditing({ ...editing, message_template: defaultMessage, cta_url: defaultCta });
    setFeedback({ type: "success", message: "Padrão restaurado na edição. Clique em Salvar alterações para confirmar." });
  }

  async function sendTest() {
    if (!editing) return;
    const phone = normalizePhone(testPhone);
    if (phone.length < 12) {
      setFeedback({ type: "error", message: "Informe um número com DDI e DDD." });
      return;
    }
    setTesting(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/comunicacao/automations/${editing.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: testName, message_template: editing.message_template, cta_url: editing.cta_url }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha no envio de teste.");
      setFeedback({ type: "success", message: `Teste enviado para +${phone}.` });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Erro no envio de teste." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([group, items]) => items.length ? (
        <section key={group} className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Mensagens automáticas</p>
            <h3 className="mt-1 text-xl font-semibold text-white">{group}</h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((automation) => (
              <article key={automation.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-semibold text-white">{automation.name}</h4>
                    <p className="mt-1 text-xs text-slate-400">{automation.description || "Mensagem automática do Harmomus."}</p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${automation.status === "active" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-slate-400/30 bg-slate-500/10 text-slate-300"}`}>
                    {automation.status === "active" ? "Ativa" : "Pausada"}
                  </span>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300 whitespace-pre-wrap line-clamp-5">{automation.message_template}</div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-500">Gatilho protegido: {automation.trigger_event}</span>
                  <button onClick={() => openEditor(automation)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20">
                    <Edit3 size={15} /> Editar
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null)}

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-cyan-400/20 bg-slate-950 p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Editar mensagem automática</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">{editing.name}</h3>
                <p className="mt-1 text-sm text-slate-400">Gatilho técnico protegido: {editing.trigger_event}</p>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/10"><XCircle size={20} /></button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Status
                <select value={editing.status} onChange={(event) => setEditing({ ...editing, status: event.target.value })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white">
                  <option value="active">Ativa</option><option value="paused">Pausada</option><option value="draft">Rascunho</option>
                </select>
              </label>
              <label className="text-sm text-slate-300">Cooldown (horas)
                <input type="number" min={0} value={editing.cooldown_hours} onChange={(event) => setEditing({ ...editing, cooldown_hours: Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" />
              </label>
            </div>

            <label className="mt-4 block text-sm text-slate-300">Mensagem
              <textarea value={editing.message_template} onChange={(event) => setEditing({ ...editing, message_template: event.target.value })} rows={10} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-cyan-400/50" />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">{VARIABLES.map((variable) => <button key={variable} type="button" onClick={() => setEditing({ ...editing, message_template: `${editing.message_template}${editing.message_template.endsWith(" ") || editing.message_template.endsWith("\n") ? "" : " "}${variable}` })} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-cyan-200 hover:bg-white/10">{variable}</button>)}</div>

            <label className="mt-4 block text-sm text-slate-300">Link do botão/CTA
              <input value={editing.cta_url ?? ""} onChange={(event) => setEditing({ ...editing, cta_url: event.target.value || null })} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-white" placeholder="https://harmomus.com/..." />
            </label>

            <div className="mt-6 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
              <div className="flex items-center gap-2 text-violet-100"><MessageCircle size={18} /><h4 className="font-semibold">Enviar teste</h4></div>
              <p className="mt-1 text-xs text-violet-100/70">O teste usa o WhatsApp real, mas não afeta cooldown, score ou estatísticas dos assinantes.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
                <input value={testName} onChange={(event) => setTestName(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-white" placeholder="Nome" />
                <input value={testPhone} onChange={(event) => setTestPhone(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-white" placeholder="5571993392294" />
                <button onClick={sendTest} disabled={testing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{testing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Testar</button>
              </div>
            </div>

            {feedback ? <div className={`mt-4 flex items-center gap-2 rounded-xl border p-3 text-sm ${feedback.type === "success" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>{feedback.type === "success" ? <CheckCircle2 size={17} /> : <XCircle size={17} />}{feedback.message}</div> : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button onClick={restoreDefault} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"><RotateCcw size={16} /> Restaurar padrão</button>
              <button onClick={saveAutomation} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Salvar alterações</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
