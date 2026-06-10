"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, LayoutDashboard, Menu, Users, Waves } from "lucide-react";

const primaryItems = [
  { label: "Início", href: "/admin", icon: LayoutDashboard },
  { label: "Kits", href: "/admin/kits", icon: Waves },
  { label: "Assin.", href: "/admin/assinaturas", icon: CreditCard },
  { label: "Membros", href: "/admin/membros", icon: Users },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
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

        <a
          href="#admin-menu"
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium text-muted transition hover:bg-surface-muted hover:text-foreground"
        >
          <Menu size={18} />
          <span>Mais</span>
        </a>
      </div>
    </nav>
  );
}
