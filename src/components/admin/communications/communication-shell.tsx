import { ReactNode } from "react";
import Link from "next/link";

const tabs = [
  ["Dashboard", "/admin/comunicacao/dashboard"],
  ["Campanhas", "/admin/comunicacao/campaigns"],
  ["Audiência", "/admin/comunicacao/audience"],
  ["Templates", "/admin/comunicacao/templates"],
  ["Automações", "/admin/comunicacao/automations"],
  ["WhatsApp", "/admin/comunicacao/whatsapp"],
  ["E-mails", "/admin/comunicacao/emails"],
  ["Logs", "/admin/comunicacao/logs"],
] as const;

export function CommunicationShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Central de Comunicação</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">{tabs.map(([l,h])=> <Link key={h} href={h} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:border-cyan-400/40">{l}</Link>)}</div>
      {children}
    </div>
  );
}
