"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  Database,
  Home,
  LayoutDashboard,
  Library,
  Menu,
  MessageSquareText,
  PanelTop,
  Settings,
  Sparkles,
  Tags,
  Users,
  Waves,
  Webhook,
  X,
} from "lucide-react";
import { useState } from "react";

const primaryItems = [
  { label: "Início", href: "/admin", icon: LayoutDashboard },
  { label: "Kits", href: "/admin/kits", icon: Waves },
  { label: "Assin.", href: "/admin/assinaturas", icon: CreditCard },
  { label: "Membros", href: "/admin/membros", icon: Users },
];

const moreGroups = [
  {
    label: "Biblioteca",
    items: [
      { label: "Categorias", href: "/admin/categorias", icon: Tags },
      { label: "Banners Home", href: "/admin/banners", icon: PanelTop },
      { label: "Blocos Home", href: "/admin/home-sections", icon: Home },
      { label: "Enquetes", href: "/admin/enquetes", icon: MessageSquareText },
    ],
  },
  {
    label: "Operação",
    items: [
      { label: "Billing", href: "/admin/billing", icon: CreditCard },
      { label: "Planos", href: "/admin/planos", icon: Library },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { label: "Premium", href: "/admin/harmomus-premium", icon: Sparkles },
    ],
  },
  {
    label: "Sistema",
    items: [
      { label: "Migração", href: "/admin/migracao", icon: Database },
      { label: "Webhooks", href: "/admin/webhooks", icon: Webhook },
      { label: "Configurações", href: "/admin/configuracoes", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-3 bottom-24 max-h-[70vh] overflow-y-auto rounded-[2rem] border border-border bg-surface/95 p-4 shadow-premium" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.26em] text-gold-300">Menu Admin</p>
                <h2 className="text-lg font-semibold text-foreground">Mais opções</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-background/70 text-muted transition hover:text-foreground" aria-label="Fechar menu">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5">
              {moreGroups.map((group) => (
                <section key={group.label} className="space-y-2">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300/90">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm transition ${
                            active
                              ? "border-gold-500/40 bg-gold-500/10 text-foreground"
                              : "border-border/70 bg-background/55 text-muted hover:border-gold-500/30 hover:text-foreground"
                          }`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/20 bg-gold-500/10 text-gold-200">
                            <Icon size={16} />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-surface/95 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 shadow-premium backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[1.5rem] border border-border/70 bg-background/70 p-1.5">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${
                  active ? "bg-gold-500/15 text-gold-100" : "text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition ${open ? "bg-gold-500/15 text-gold-100" : "text-muted hover:bg-surface-muted hover:text-foreground"}`}
            aria-expanded={open}
            aria-label="Abrir mais opções do admin"
          >
            <Menu size={18} />
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
