import { DashboardCard } from "@/components/admin/dashboard-card";
import { PageHeader } from "@/components/admin/page-header";

const metrics = [
  { label: "Total de Kits", value: "0", helper: "Pronto para sincronizar com Supabase" },
  { label: "Total de Usuários", value: "0", helper: "Dados de profiles + auth.users" },
  { label: "Assinaturas Ativas", value: "0", helper: "Preparado para billing recorrente" },
  { label: "Uploads Recentes", value: "0", helper: "Estrutura pronta para leitura do R2" },
];

export default function AdminPage() {
  return (
    <section>
      <PageHeader title="Dashboard" description="Visão geral da operação Harmomus." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <DashboardCard key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  );
}
