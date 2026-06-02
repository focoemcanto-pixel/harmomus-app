import { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Bot, FileImage, FileText, Mail, MessageCircle, Megaphone, ScrollText, Settings, Target, Users } from "lucide-react";

const tabs = [
  { label: "Dashboard", href: "/admin/comunicacao/dashboard", icon: BarChart3, description: "Visão geral" },
  { label: "Campanhas", href: "/admin/comunicacao/campaigns", icon: Megaphone, description: "Fluxos de disparo" },
  { label: "Audiência", href: "/admin/comunicacao/audience", icon: Users, description: "CRM e contatos" },
  { label: "Segmentos", href: "/admin/comunicacao/segmentos", icon: Target, description: "Públicos inteligentes" },
  { label: "Templates", href: "/admin/comunicacao/templates", icon: FileText, description: "Modelos de mensagem" },
  { label: "Biblioteca", href: "/admin/comunicacao/media", icon: FileImage, description: "Mídias de campanha" },
  { label: "Automações", href: "/admin/comunicacao/automations", icon: Bot, description: "Regras e gatilhos" },
  { label: "WhatsApp", href: "/admin/comunicacao/whatsapp", icon: MessageCircle, description: "Canal WhatsApp" },
  { label: "E-mails", href: "/admin/comunicacao/emails", icon: Mail, description: "Canal e-mail" },
  { label: "Configurações", href: "/admin/comunicacao/settings", icon: Settings, description: "APIs e limites" },
  { label: "Logs", href: "/admin/comunicacao/logs", icon: ScrollText, description: "Histórico" },
] as const;

type CommunicationShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  hideNavigation?: boolean;
};

export function CommunicationShell({
  title,
  subtitle,
  children,
  hideNavigation = false,
}: CommunicationShellProps) {
  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-background shadow-premium">
        <div className="p-5 sm:p-7">
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Central de Comunicação</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{subtitle}</p>
        </div>
      </div>

      {hideNavigation ? null : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="group rounded-2xl border border-white/10 bg-slate-900/70 p-4 transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-500/10 text-cyan-200 transition group-hover:border-cyan-300/50">
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{tab.label}</p>
                    <p className="truncate text-xs text-slate-400">
                      {tab.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}
