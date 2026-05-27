import { CommunicationShell } from "@/components/admin/communications/communication-shell";

const metrics = ["Taxa de abertura", "CTR", "Conversão", "Entregas", "Usuários ativos", "Crescimento"];

export default function ComunicacaoDashboardPage() {
  return <CommunicationShell title="Dashboard" subtitle="Visão executiva omnichannel com performance por canal, segmento e automação."><div className="grid gap-3 md:grid-cols-3">{metrics.map((m)=> <div key={m} className="rounded-2xl border border-white/10 bg-slate-900 p-4"><p className="text-xs text-slate-400">{m}</p><p className="mt-2 text-2xl font-semibold text-white">--</p></div>)}</div></CommunicationShell>;
}
