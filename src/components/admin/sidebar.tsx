import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  Database,
  Home,
  LayoutDashboard,
  Library,
  MessageSquareText,
  PanelTop,
  Settings,
  Sparkles,
  Tags,
  Users,
  Waves,
  Webhook,
  Send,
} from "lucide-react";

type AdminNavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type AdminNavGroup = {
  label: string;
  description: string;
  items: AdminNavItem[];
};

const navGroups: AdminNavGroup[] = [
  {
    label: "Visão geral",
    description: "Painel executivo",
    items: [{ label: "Dashboard", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Conteúdo",
    description: "Biblioteca e home",
    items: [
      { label: "Kits Vocais", href: "/admin/kits", icon: Waves },
      { label: "Categorias", href: "/admin/categorias", icon: Tags },
      { label: "Banners Home", href: "/admin/banners", icon: PanelTop },
      { label: "Blocos Home", href: "/admin/home-sections", icon: Home },
    ],
  },
  {
    label: "Assinaturas",
    description: "Planos, membros e cobrança",
    items: [
      { label: "Planos", href: "/admin/planos", icon: Library },
      { label: "Membros", href: "/admin/membros", icon: Users },
      { label: "Billing", href: "/admin/billing", icon: CreditCard },
    ],
  },
  {
    label: "Ministérios",
    description: "Planos e premium",
    items: [
      { label: "Planos Ministeriais", href: "/admin/planos-ministeriais", icon: Users },
      { label: "Harmomus Premium", href: "/admin/harmomus-premium", icon: Sparkles },
      { label: "Solicitações", href: "/admin/harmomus-premium/solicitacoes", icon: MessageSquareText },
    ],
  },
  {
    label: "Marketing",
    description: "Comunicação e métricas",
    items: [
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Comunicação", href: "/admin/comunicacao", icon: Send },
      { label: "Campanhas", href: "/admin/comunicacao/campanhas", icon: Send },
      { label: "Audiência", href: "/admin/comunicacao/audiencia", icon: Send },
      { label: "Segmentos", href: "/admin/comunicacao/segmentos", icon: Send },
      { label: "Templates", href: "/admin/comunicacao/templates", icon: Send },
      { label: "Automação", href: "/admin/comunicacao/automacao", icon: Send },
      { label: "WhatsApp", href: "/admin/comunicacao/whatsapp", icon: Send },
      { label: "E-mails", href: "/admin/comunicacao/e-mails", icon: Send },
      { label: "Logs", href: "/admin/comunicacao/logs", icon: Send },
    ],
  },
  {
    label: "Sistema",
    description: "Operação técnica",
    items: [
      { label: "Migração", href: "/admin/migracao", icon: Database },
      { label: "Webhooks", href: "/admin/webhooks", icon: Webhook },
      { label: "Configurações", href: "/admin/configuracoes", icon: Settings },
    ],
  },
];

function NavGroups({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? "space-y-4" : "space-y-5"}>
      {navGroups.map((group) => (
        <section key={group.label} className="space-y-2">
          <div className="px-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">{group.label}</p>
            {!mobile ? <p className="mt-0.5 text-[11px] text-muted/70">{group.description}</p> : null}
          </div>

          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm text-muted transition hover:border-gold-500/30 hover:bg-surface-muted hover:text-foreground"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/70 bg-background/60 text-gold-300 transition group-hover:border-gold-500/40 group-hover:bg-gold-500/10">
                    <Icon size={16} />
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-80 shrink-0 overflow-y-auto border-r border-border bg-surface/70 p-6 backdrop-blur lg:block">
        <div className="mb-8 rounded-3xl border border-gold-500/20 bg-gradient-to-br from-gold-500/10 via-surface-muted to-background p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.35em] text-gold-300">Harmomus</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Studio Admin</h1>
          <p className="mt-2 text-xs leading-5 text-muted">Operação, conteúdo, assinaturas e marketing em uma central premium.</p>
        </div>

        <NavGroups />
      </aside>

      <details className="mb-4 rounded-2xl border border-border bg-surface/90 p-3 shadow-premium lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-2 py-2 text-sm font-semibold text-foreground">
          Menu Admin
          <span className="rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs text-gold-200">Abrir</span>
        </summary>
        <div className="mt-4 max-h-[70vh] overflow-y-auto rounded-2xl border border-border/70 bg-background/50 p-3">
          <NavGroups mobile />
        </div>
      </details>
    </>
  );
}
