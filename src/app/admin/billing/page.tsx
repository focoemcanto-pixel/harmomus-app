import { PageHeader } from "@/components/admin/page-header";

export default function BillingPage() {
  return (
    <section>
      <PageHeader title="Billing" description="Visão administrativa de assinaturas, cobrança e gateways." />
      <div className="rounded-xl border border-border bg-surface p-8 text-sm text-muted shadow-premium">
        Área reservada para conciliação de pagamentos, gestão de faturas e suporte de assinaturas.
      </div>
    </section>
  );
}
