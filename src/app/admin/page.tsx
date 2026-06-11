import Link from "next/link";
import { BarChart3, CreditCard, Database, Home, Library, MessageSquareText, Settings, Sparkles, Tags, Users, Waves } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const groups = [
  {
    title: "Biblioteca",
    helper: "Gerencie tudo que aparece para o usuário final.",
    items: [
      { label: "Kits Vocais", helper: "Crie, edite e publique kits.", href: "/admin/kits", icon: Waves },
      { label: "Categorias", helper: "Organize biblioteca pública.", href: "/admin/categorias", icon: Tags },
      { label: "Banners Home", helper: "Controle a primeira dobra da home.", href: "/admin/banners", icon: Home },
      { label: "Blocos Home", helper: "Organize seções promocionais.", href: "/admin/home-sections", icon: Library },
    ],
  },
  {
    title: "Assinaturas",
    helper: "Controle planos, membros e operações de cobrança.",
    items: [
      { label: "Planos", helper: "Gerencie hierarquia de acesso.", href: "/admin/planos", icon: Library },
      { label: "Membros", helper: "Controle assinantes e acesso.", href: "/admin/membros", icon: Users },
      { label: "Billing", helper: "Acompanhe pagamentos e planos.", href: "/admin/billing", icon: CreditCard },
    ],
  },
  {
    title: "Marketing e relacionamento",
    helper: "Acompanhe métricas e conduza comunicação com usuários.",
    items: [
      { label: "Analytics", helper: "Métricas de uso e performance.", href: "/admin/analytics", icon: BarChart3 },
      { label: "Central de Comunicação", helper: "Campanhas, audiência, templates e canais.", href: "/admin/comunicacao", icon: MessageSquareText },
    ],
  },
  {
    title: "Ministérios e sistema",
    helper: "Áreas premium, solicitações e operação técnica.",
    items: [
      { label: "Harmomus Premium", helper: "Gerencie a experiência premium.", href: "/admin/harmomus-premium", icon: Sparkles },
      { label: "Solicitações Premium", helper: "Pedidos reais de músicas e tons.", href: "/admin/harmomus-premium/solicitacoes", icon: MessageSquareText },
      { label: "Migração", helper: "Importe base de assinaturas.", href: "/admin/migracao", icon: Database },
      { label: "Configurações", helper: "Ajustes da central administrativa.", href: "/admin/configuracoes", icon: Settings },
    ],
  },
];

async function getCount(supabase: any, table: string, filter?: (query: any) => any) {
  const baseQuery = supabase.from(table).select("*", { count: "exact", head: true });
  const query = filter ? filter(baseQuery) : baseQuery;
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}

export default async function AdminPage() {
  const supabase = (await createClient()) as any;

  const [kitsCount, publishedKitsCount, categoriesCount, profilesCount, activeSubscriptionsCount, plansCount, bannersCount, homeSectionsCount] = await Promise.all([
    getCount(supabase, "kits"),
    getCount(supabase, "kits", (query) => query.eq("published", true)),
    getCount(supabase, "categories"),
    getCount(supabase, "profiles"),
    getCount(supabase, "subscriptions", (query) => query.in("status", ["active", "trialing"])),
    getCount(supabase, "plans", (query) => query.eq("status", "active")),
    getCount(supabase, "home_banners", (query) => query.eq("is_active", true)),
    getCount(supabase, "home_sections", (query) => query.eq("active", true)),
  ]);

  const quickStats = [
    { label: "Kits publicados", value: publishedKitsCount ?? "-", helper: `${kitsCount ?? "-"} cadastrados` },
    { label: "Categorias", value: categoriesCount ?? "-", helper: "Biblioteca" },
    { label: "Membros", value: profilesCount ?? "-", helper: `${activeSubscriptionsCount ?? "-"} ativos` },
    { label: "Vitrine ativa", value: (bannersCount ?? 0) + (homeSectionsCount ?? 0), helper: `${bannersCount ?? "-"} banners • ${homeSectionsCount ?? "-"} blocos` },
  ];

  return (
    <section className="space-y-4 sm:space-y-8">
      <div className="overflow-hidden rounded-3xl border border-gold-500/20 bg-gradient-to-br from-gold-500/10 via-surface to-background p-4 shadow-premium sm:p-7">
        <PageHeader title="Harmomus Studio" description="Central executiva para operar biblioteca, assinaturas, marketing e sistema em um só lugar." />
        <div className="-mx-4 mt-5 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-4 md:px-0">
          {quickStats.map((stat) => (
            <div key={stat.label} className="min-w-[155px] rounded-2xl border border-border/80 bg-background/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-gold-300 sm:text-xs">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{stat.helper}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 sm:text-xs">Saúde do conteúdo</p>
          <p className="mt-2 text-base font-semibold text-white sm:text-lg">{publishedKitsCount ?? "-"} kits disponíveis</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Conteúdo publicado e pronto para consumo.</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 sm:text-xs">Planos ativos</p>
          <p className="mt-2 text-base font-semibold text-white sm:text-lg">{plansCount ?? "-"} plano(s)</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Controle de acesso e assinatura.</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300 sm:text-xs">Operação visual</p>
          <p className="mt-2 text-base font-semibold text-white sm:text-lg">{(bannersCount ?? 0) + (homeSectionsCount ?? 0)} item(ns) ativos</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Banners e blocos ativos na home.</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((group) => (
          <section key={group.title} className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-6">
            <div className="mb-4 border-b border-border/70 pb-3 sm:mb-5 sm:pb-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-gold-300 sm:text-xs">Área</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">{group.title}</h2>
              <p className="mt-1 text-xs text-muted sm:text-sm">{group.helper}</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-2xl border border-border bg-background/60 p-3 transition hover:border-gold-500/40 hover:bg-gold-500/10 sm:p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold-500/20 bg-gold-500/10 text-gold-200 transition group-hover:border-gold-400/50 sm:h-10 sm:w-10">
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.helper}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
