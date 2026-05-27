import { getCommunicationDashboard } from "@/lib/communication/service";

export async function DashboardCards() {
  const data = await getCommunicationDashboard();
  const cards = [
    ["Total contatos", data.contacts],
    ["Campanhas ativas", data.activeCampaigns],
    ["Entregas", data.sent],
    ["Open rate", `${data.openRate.toFixed(1)}%`],
    ["CTR", `${data.ctr.toFixed(1)}%`],
    ["Conversão", `${data.conversion.toFixed(1)}%`],
  ];
  return <div className="grid gap-3 md:grid-cols-3">{cards.map(([l,v]) => <div key={l} className="rounded-2xl border border-cyan-400/20 bg-slate-900/80 p-4"><p className="text-xs text-slate-400">{l}</p><p className="mt-2 text-2xl font-semibold text-white">{v}</p></div>)}</div>;
}
