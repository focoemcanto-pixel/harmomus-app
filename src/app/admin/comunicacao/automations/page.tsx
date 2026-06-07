import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Bot, Clock, Flame, PauseCircle, PlayCircle, ShieldCheck, Zap } from "lucide-react";

import { CommunicationShell } from "@/components/admin/communications/communication-shell";
import { getMarketingEngineSettings, updateMarketingEngineSettings } from "@/lib/communication/engine-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string;
  intent: string;
  priority: number;
  score_weight: number;
  score_threshold: number;
  lookback_hours: number;
  cooldown_hours: number;
  channel: string;
  status: string;
  cta_url: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationRun = {
  id: string;
  automation_id: string | null;
  user_id: string | null;
  trigger_event_key: string | null;
  intent: string | null;
  channel: string | null;
  score: number | null;
  status: string | null;
  skipped_reason: string | null;
  error_message: string | null;
  created_at: string;
  automation?: { name?: string | null } | null;
  profile?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
};

type MarketingState = {
  user_id: string;
  current_score: number | null;
  dominant_intent: string | null;
  cooldown_until: string | null;
  updated_at: string;
};

type EventSummary = {
  event_key: string | null;
  created_at: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function nextRunLabel(value?: string | null, intervalMinutes = 5) {
  if (!value) return "Após o próximo cron";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + intervalMinutes);
  return formatDate(date.toISOString());
}

function statusBadge(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  const label = normalized || "desconhecido";
  const className =
    normalized === "active"
      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
      : normalized === "draft"
        ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : normalized === "paused"
          ? "border-slate-400/30 bg-slate-500/10 text-slate-200"
          : normalized === "queued" || normalized === "sent"
            ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-200"
            : normalized === "skipped"
              ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-200"
              : normalized === "failed"
                ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                : "border-white/10 bg-white/5 text-slate-300";

  return <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>{label}</span>;
}

function StatCard({ title, value, hint, icon: Icon }: { title: string; value: string | number; hint: string; icon: typeof Bot }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          <p className="mt-1 text-sm text-slate-400">{hint}</p>
        </div>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

async function getAutomationData() {
  const supabase = createSupabaseAdminClient() as any;
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [automations, runs, states, events, settings] = await Promise.all([
    supabase
      .from("marketing_automations")
      .select("id,name,description,trigger_event,intent,priority,score_weight,score_threshold,lookback_hours,cooldown_hours,channel,status,cta_url,created_at,updated_at")
      .order("priority", { ascending: true }),
    supabase
      .from("marketing_automation_runs")
      .select("id,automation_id,user_id,trigger_event_key,intent,channel,score,status,skipped_reason,error_message,created_at,automation:marketing_automations(name),profile:profiles(full_name,email,phone)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("user_marketing_state")
      .select("user_id,current_score,dominant_intent,cooldown_until,updated_at")
      .order("current_score", { ascending: false })
      .limit(10),
    supabase
      .from("marketing_events")
      .select("event_key,created_at")
      .gte("created_at", since7d)
      .in("event_key", ["audio_played", "premium_blocked", "tone_blocked", "checkout_started", "checkout_completed", "payment_failed"])
      .order("created_at", { ascending: false })
      .limit(5000),
    getMarketingEngineSettings(supabase),
  ]);

  return {
    automations: (automations.data ?? []) as Automation[],
    runs: (runs.data ?? []) as AutomationRun[],
    states: (states.data ?? []) as MarketingState[],
    events: (events.data ?? []) as EventSummary[],
    settings: settings.data,
    settingsMissingTable: settings.missingTable,
    errors: [automations.error, runs.error, states.error, events.error, settings.error].filter(Boolean).map((error: any) => error.message),
  };
}

function summarizeEvents(events: EventSummary[]) {
  return events.reduce<Record<string, number>>((acc, event) => {
    const key = event.event_key || "unknown";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export default async function Page() {
  async function startProduction() {
    "use server";
    await updateMarketingEngineSettings({ production_enabled: true, paused_reason: null });
    revalidatePath("/admin/comunicacao/automations");
  }

  async function pauseProduction() {
    "use server";
    await updateMarketingEngineSettings({ production_enabled: false, paused_reason: "Produção pausada pelo admin." });
    revalidatePath("/admin/comunicacao/automations");
  }

  const { automations, runs, states, events, settings, settingsMissingTable, errors } = await getAutomationData();
  const active = automations.filter((automation) => automation.status === "active").length;
  const eventSummary = summarizeEvents(events);
  const queued = runs.filter((run) => run.status === "queued").length;
  const skipped = runs.filter((run) => run.status === "skipped").length;
  const isProductionActive = Boolean(settings.production_enabled);

  return (
    <CommunicationShell
      title="Automações comportamentais"
      subtitle="Regras inteligentes que leem comportamento, aplicam score, respeitam cooldown e criam campanhas automáticas sem bombardear o mesmo lead."
    >
      {errors.length ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">Algumas consultas não responderam.</p>
          <p className="mt-1 text-amber-100/80">{errors.join(" • ")}</p>
        </div>
      ) : null}

      {settingsMissingTable ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
          A tabela <strong>marketing_engine_settings</strong> ainda não existe no Supabase. Aplique a migration para ativar Play/Pause da produção.
        </div>
      ) : null}

      <section className={`rounded-3xl border p-5 ${isProductionActive ? "border-emerald-400/30 bg-emerald-500/10" : "border-rose-400/30 bg-rose-500/10"}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Status do motor</p>
            <h3 className="mt-1 text-2xl font-semibold text-white">
              {isProductionActive ? "🟢 Produção ativa" : "🔴 Produção pausada"}
            </h3>
            <p className="mt-1 text-sm text-slate-300">
              {isProductionActive
                ? "O cron está autorizado a processar eventos, criar fila e enviar mensagens automaticamente."
                : "Nenhuma automação será processada pelo cron enquanto a produção estiver pausada."}
            </p>
          </div>
          <form action={isProductionActive ? pauseProduction : startProduction}>
            <button className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${isProductionActive ? "border border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20" : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"}`} type="submit">
              {isProductionActive ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
              {isProductionActive ? "Pausar produção" : "Iniciar produção"}
            </button>
          </form>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-slate-400">Última execução</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatDate(settings.last_automation_run_at)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-slate-400">Próxima execução estimada</p>
            <p className="mt-1 text-sm font-semibold text-white">{nextRunLabel(settings.last_automation_run_at, settings.processing_interval_minutes)}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-slate-400">Intervalo</p>
            <p className="mt-1 text-sm font-semibold text-white">{settings.processing_interval_minutes} min</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Regras ativas" value={`${active}/${automations.length}`} hint="Automações prontas para rodar" icon={Bot} />
        <StatCard title="Eventos 7 dias" value={events.length} hint="Sinais comportamentais capturados" icon={Zap} />
        <StatCard title="Fila criada" value={queued} hint="Leads enviados para comunicação" icon={PlayCircle} />
        <StatCard title="Proteções" value={skipped} hint="Mensagens evitadas por regra/cooldown" icon={ShieldCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Motor</p>
              <h3 className="mt-1 text-xl font-semibold text-white">Processamento das automações</h3>
              <p className="mt-1 text-sm text-slate-400">Use o teste apenas para validar regras. A produção contínua é controlada pelo Play/Pause acima.</p>
            </div>
            <Link
              href="/api/admin/comunicacao/automations/process?dryRun=true"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Testar agora
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(eventSummary).map(([key, count]) => (
              <div key={key} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <p className="text-sm font-semibold text-white">{key}</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-200">{count}</p>
                <p className="mt-1 text-xs text-slate-500">últimos 7 dias</p>
              </div>
            ))}
            {!Object.keys(eventSummary).length ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
                Ainda não há eventos comportamentais nos últimos 7 dias.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-200">
              <Flame size={18} />
            </span>
            <div>
              <h3 className="text-xl font-semibold text-white">Leads mais quentes</h3>
              <p className="text-sm text-slate-400">Ordenado pelo score comercial atual.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {states.map((state) => (
              <div key={state.user_id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{state.dominant_intent ?? "sem intenção dominante"}</p>
                    <p className="text-xs text-slate-500">{state.user_id}</p>
                  </div>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-sm font-semibold text-cyan-200">
                    {state.current_score ?? 0}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <Clock size={14} />
                  Cooldown até: {formatDate(state.cooldown_until)}
                </div>
              </div>
            ))}
            {!states.length ? <p className="text-sm text-slate-400">Nenhum lead com estado comercial calculado ainda.</p> : null}
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Regras</p>
            <h3 className="mt-1 text-xl font-semibold text-white">Automações configuradas</h3>
          </div>
          <p className="text-sm text-slate-400">Ative ou pause a produção pelo controle principal do motor.</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-12 bg-slate-900/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span className="col-span-4">Regra</span>
            <span className="col-span-2">Gatilho</span>
            <span className="col-span-2">Score</span>
            <span className="col-span-2">Cooldown</span>
            <span className="col-span-2">Status</span>
          </div>
          {automations.map((automation) => (
            <div key={automation.id} className="grid grid-cols-12 items-center border-t border-white/10 px-4 py-4 text-sm">
              <div className="col-span-4 pr-4">
                <p className="font-semibold text-white">{automation.name}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{automation.description}</p>
                <p className="mt-2 text-xs text-cyan-300">Prioridade {automation.priority} • {automation.channel}</p>
              </div>
              <div className="col-span-2 text-slate-300">{automation.trigger_event}</div>
              <div className="col-span-2 text-slate-300">
                <p>{automation.score_weight} por evento</p>
                <p className="text-xs text-slate-500">mín. {automation.score_threshold}</p>
              </div>
              <div className="col-span-2 text-slate-300">{automation.cooldown_hours}h</div>
              <div className="col-span-2">{statusBadge(automation.status)}</div>
            </div>
          ))}
          {!automations.length ? <p className="p-4 text-sm text-slate-400">Nenhuma automação encontrada. Aplique a migration do motor comportamental.</p> : null}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200">
            <PauseCircle size={18} />
          </span>
          <div>
            <h3 className="text-xl font-semibold text-white">Últimas execuções</h3>
            <p className="text-sm text-slate-400">Inclui mensagens enviadas para fila e disparos evitados por proteção.</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{run.automation?.name ?? run.intent ?? "Automação"}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {run.profile?.full_name || run.profile?.email || run.user_id || "Lead"} • {run.trigger_event_key} • score {run.score ?? 0}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(run.status)}
                  <span className="text-xs text-slate-500">{formatDate(run.created_at)}</span>
                </div>
              </div>
              {run.skipped_reason || run.error_message ? (
                <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                  {run.skipped_reason || run.error_message}
                </p>
              ) : null}
            </div>
          ))}
          {!runs.length ? <p className="text-sm text-slate-400">Nenhuma execução registrada ainda.</p> : null}
        </div>
      </section>
    </CommunicationShell>
  );
}
