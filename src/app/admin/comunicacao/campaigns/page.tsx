import { CommunicationShell } from "@/components/admin/communications/communication-shell";

const steps = ["Criar campanha","Selecionar canal","Selecionar audiência","Montar conteúdo","Preview","Envio teste","Agendar","Publicar"];
export default function Page() {
  return <CommunicationShell title="Campanhas" subtitle="Fluxo enterprise de campanhas com aprovação e fila."><div className="grid gap-3 md:grid-cols-2">{steps.map((s,i)=><div key={s} className="rounded-xl border border-white/10 bg-slate-900/70 p-4"><p className="text-xs text-cyan-300">Etapa {i+1}</p><p className="mt-1 text-white">{s}</p></div>)}</div></CommunicationShell>;
}
