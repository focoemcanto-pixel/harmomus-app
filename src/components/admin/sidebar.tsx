import Link from "next/link";
import { CreditCard, LayoutDashboard, Library, Settings, Tags, Users, Waves, Database, PanelTop } from "lucide-react";

const items = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Kits Vocais", href: "/admin/kits", icon: Waves },
  { label: "Categorias", href: "/admin/categorias", icon: Tags },
  { label: "Banners Home", href: "/admin/banners", icon: PanelTop },
  { label: "Planos", href: "/admin/planos", icon: Library },
  { label: "Membros", href: "/admin/membros", icon: Users },
  { label: "Billing", href: "/admin/billing", icon: CreditCard },
  { label: "Migração", href: "/admin/migracao", icon: Database },
  { label: "Configurações", href: "/admin/configuracoes", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-surface/60 p-6 lg:block">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.35em] text-gold-300">Harmomus</p>
        <h1 className="text-xl font-semibold text-foreground">Studio Admin</h1>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm text-muted transition hover:border-gold-500/40 hover:bg-surface-muted hover:text-foreground"
            >
              <Icon size={17} className="text-gold-400" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
