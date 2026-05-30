import Link from "next/link";
import {
  BarChart3,
  Bell,
  History,
  ExternalLink,
  LayoutDashboard,
  ListMusic,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

const navItems = [
  { href: "/ministerio", label: "Visão Geral", icon: LayoutDashboard },
  { href: "/ministerio#integrantes", label: "Integrantes", icon: Users },
  { href: "/ministerio#convites", label: "Convites", icon: UserPlus },
  { href: "/ministerio/repertorios", label: "Repertórios", icon: ListMusic },
  { href: "/ministerio#permissoes", label: "Permissões", icon: ShieldCheck },
  { href: "/ministerio/solicitacoes", label: "Solicitações", icon: Bell },
  { href: "/ministerio/historico", label: "Histórico", icon: History },
  { href: "/ministerio/relatorios", label: "Relatórios", icon: BarChart3 },
] as const;

export function MinistryShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#020617] px-4 py-6 text-white md:px-8 md:py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_88%_20%,rgba(217,70,239,0.16),transparent_35%),radial-gradient(circle_at_45%_85%,rgba(16,185,129,0.12),transparent_36%)]" />
      <section className="relative mx-auto max-w-7xl space-y-6">
        <MinistryNav />
        {children}
      </section>
    </main>
  );
}

export function MinistryNav() {
  return (
    <nav className="flex gap-2 overflow-x-auto rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-2 shadow-[0_20px_80px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            <Icon className="h-4 w-4 text-cyan-200" />
            {item.label}
          </Link>
        );
      })}
      <Link
        href="/"
        className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20"
      >
        <ExternalLink className="h-4 w-4" /> Ver site
      </Link>
    </nav>
  );
}

export function PremiumPanel({
  children,
  id,
  className = "",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl md:p-6 ${className}`}
    >
      {children}
    </section>
  );
}

export function formatDate(value?: string | null, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function statusLabel(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "active") return "Ativo";
  if (normalized === "pending") return "Pendente";
  if (normalized === "invited") return "Convidado";
  if (normalized === "trialing") return "Em teste";
  if (normalized === "removed") return "Arquivado";
  return status || "—";
}

export function roleLabel(role?: string | null) {
  if (role === "owner") return "Responsável";
  if (role === "admin" || role === "manager") return "Admin";
  return "Integrante";
}

export function planLabel(planType?: string | null) {
  if (planType === "ministry_40") return "Ministerial 40";
  if (planType === "ministry_20") return "Ministerial 20";
  if (planType === "ministry_10") return "Ministerial 10";
  return "Ministerial";
}
