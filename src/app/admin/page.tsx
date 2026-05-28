import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";

const cards = [
  { label: "Kits Vocais", helper: "Crie, edite e publique kits.", href: "/admin/kits" },
  { label: "Categorias/Artistas", helper: "Organize biblioteca pública.", href: "/admin/categorias" },
  { label: "Planos", helper: "Gerencie hierarquia de acesso.", href: "/admin/planos" },
  { label: "Membros", helper: "Controle assinantes e acesso.", href: "/admin/membros" },
  { label: "Assinaturas/Billing", helper: "Acompanhe pagamentos e planos.", href: "/admin/billing" },
  { label: "Solicitações Premium", helper: "Gerencie pedidos reais de músicas e tons.", href: "/admin/solicitacoes" },
  { label: "Migração", helper: "Importe base de assinaturas.", href: "/admin/migracao" },
  { label: "Configurações", helper: "Ajustes da central administrativa.", href: "/admin/configuracoes" },
];

export default function AdminPage() {
  return (
    <section className="space-y-6">
      <PageHeader title="Central Admin" description="Painel único para operação administrativa do Harmomus." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="rounded-xl border border-border bg-surface p-5 shadow-premium transition hover:border-gold-500/40 hover:bg-surface-muted">
            <p className="text-base font-semibold text-foreground">{card.label}</p>
            <p className="mt-2 text-sm text-muted">{card.helper}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
