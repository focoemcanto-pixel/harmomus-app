import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PencilLine, Send } from "lucide-react";

import { getCampaignManagement, type ManagedCampaign } from "@/lib/communication/service";

const STATUS_GROUPS = [
  { key: "draft", label: "Rascunhos", matches: ["draft"], icon: PencilLine },
  { key: "queued", label: "Em fila", matches: ["queued"], icon: Clock3 },
  { key: "scheduled", label: "Agendadas", matches: ["scheduled"], icon: Clock3 },
  { key: "sending", label: "Enviando", matches: ["sending", "processing"], icon: Loader2 },
  { key: "sent", label: "Concluídas", matches: ["sent", "completed", "concluida", "concluída"], icon: CheckCircle2 },
  { key: "failed", label: "Falhas", matches: ["failed", "error", "falhou"], icon: AlertTriangle },
] as const;

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function formatDate(value: string | null) {
  if (!value) return "Sem agenda";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function CampaignRow({ campaign }: { campaign: ManagedCampaign }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">{campaign.name}</h4>
          <p className="mt-1 text-xs text-slate-400">{campaign.title || "Sem título"} · {campaign.channels.join(", ") || "sem canal"}</p>
        </div>
        <Link href={`/admin/comunicacao/campaigns?campaignId=${campaign.id}`} className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/10">
          Abrir
        </Link>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-300 sm:grid-cols-5">
        <span>Agenda: {formatDate(campaign.scheduled_at)}</span>
        <span>Total: {campaign.queue.total}</span>
        <span>Pendentes: {campaign.queue.pending}</span>
        <span>Enviadas: {campaign.queue.sent}</span>
        <span>Falhas: {campaign.queue.failed}</span>
      </div>
    </article>
  );
}

export async function CampaignManagement() {
  const { campaigns, warnings } = await getCampaignManagement();

  return (
    <section className="space-y-5">
      {warnings.length ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          Algumas fontes retornaram dados parciais: {warnings.map((warning) => warning.source).join(", ")}.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {STATUS_GROUPS.map((group) => {
          const Icon = group.icon;
          const count = campaigns.filter((campaign) => group.matches.includes(normalize(campaign.status) as never)).length;
          return (
            <div key={group.key} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{group.label}</p>
                <Icon className="h-4 w-4 text-cyan-200" />
              </div>
              <p className="mt-2 text-3xl font-semibold text-white">{count}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Operação de campanhas</h3>
            <p className="text-sm text-slate-400">Lista real de communication_campaigns cruzada com communication_queue.</p>
          </div>
          <Link href="/admin/comunicacao/campaigns" className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-semibold text-white hover:bg-cyan-500">
            <Send size={15} /> Nova campanha
          </Link>
        </div>
        <div className="mt-5 grid gap-4">
          {campaigns.length ? campaigns.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />) : <p className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300">Nenhuma campanha criada ainda.</p>}
        </div>
      </div>
    </section>
  );
}
