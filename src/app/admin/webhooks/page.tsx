"use client";

import { Activity, BadgeCheck, BellRing, Globe, Send, ShieldCheck, Webhook } from "lucide-react";
import { useMemo, useState } from "react";

const EVENTS = [
  {
    group: "Assinaturas",
    items: [
      "subscription.created",
      "subscription.renewed",
      "subscription.canceled",
      "subscription.upgraded",
      "subscription.downgraded",
    ],
  },
  {
    group: "Pagamentos",
    items: ["purchase.completed", "payment.failed"],
  },
  {
    group: "Marketing",
    items: ["campaign.started", "campaign.completed", "promotion.applied", "lead.created"],
  },
  {
    group: "Sistema",
    items: ["member.migrated"],
  },
];

export default function WebhooksPage() {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [event, setEvent] = useState("purchase.completed");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const totalEvents = useMemo(() => EVENTS.reduce((acc, item) => acc + item.items.length, 0), []);

  async function sendTest() {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/webhooks/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, secret, event }),
      });

      const data = await response.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-6 pb-20">
      <div className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-violet-950/40 p-8 shadow-[0_0_80px_rgba(124,58,237,0.18)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.18),transparent_30%)]" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.25em] text-violet-200">
              <Webhook size={14} />
              Harmomus Webhooks Center
            </div>

            <h1 className="text-4xl font-bold tracking-tight text-white">Central de Webhooks</h1>
            <p className="mt-3 max-w-2xl text-base text-zinc-300">
              Configure integrações externas, automações, campanhas, eventos financeiros e sincronizações em tempo real.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:w-[420px]">
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-zinc-400"><Activity size={16} /> Eventos</div>
              <div className="mt-3 text-3xl font-bold text-white">{totalEvents}</div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-zinc-400"><ShieldCheck size={16} /> Segurança</div>
              <div className="mt-3 text-sm font-medium text-emerald-300">Secrets + assinatura</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px,1fr]">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-violet-500/10 p-3 text-violet-300">
              <BellRing size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Catálogo de Eventos</h2>
              <p className="text-sm text-zinc-400">Eventos disponíveis para integrações.</p>
            </div>
          </div>

          <div className="space-y-5">
            {EVENTS.map((group) => (
              <div key={group.group} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium text-white">{group.group}</h3>
                  <BadgeCheck size={16} className="text-emerald-400" />
                </div>

                <div className="space-y-2">
                  {group.items.map((item) => (
                    <button
                      key={item}
                      onClick={() => setEvent(item)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${event === item ? "border-violet-500 bg-violet-500/10 text-violet-100" : "border-zinc-800 bg-zinc-950/40 text-zinc-300 hover:border-zinc-700"}`}
                    >
                      <span>{item}</span>
                      <Webhook size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-300">
                <Globe size={20} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Configuração do Endpoint</h2>
                <p className="text-sm text-zinc-400">Teste integrações antes de publicar em produção.</p>
              </div>
            </div>

            <div className="grid gap-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-300">URL do Webhook</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://seusistema.com/webhooks/harmomus"
                  className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-white outline-none transition focus:border-violet-500"
                />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">Evento</label>
                  <select
                    value={event}
                    onChange={(e) => setEvent(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-white outline-none transition focus:border-violet-500"
                  >
                    {EVENTS.flatMap((group) => group.items).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-300">Webhook Secret</label>
                  <input
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    placeholder="whsec_xxxxxxxxx"
                    className="h-12 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 text-white outline-none transition focus:border-violet-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={sendTest}
                  disabled={!url || loading}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-500 px-6 text-sm font-semibold text-white shadow-[0_10px_40px_rgba(139,92,246,0.35)] transition hover:scale-[1.02] disabled:opacity-40"
                >
                  <Send size={16} />
                  {loading ? "Enviando teste..." : "Disparar Evento Teste"}
                </button>

                <button className="inline-flex h-12 items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900 px-6 text-sm font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white">
                  Ver logs
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-black/50 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Resultado do Teste</h2>
                <p className="text-sm text-zinc-400">Payload e retorno do endpoint.</p>
              </div>

              {result?.ok !== undefined && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${result.ok ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                  {result.ok ? "ENTREGUE" : "FALHA"}
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <pre className="max-h-[520px] overflow-auto p-5 text-xs leading-6 text-zinc-300">
                {JSON.stringify(result ?? {
                  message: "Nenhum teste executado ainda.",
                  example_headers: {
                    "X-Harmomus-Event": event,
                    "X-Harmomus-Secret": "whsec_xxxxx",
                  },
                }, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
