import { PageHeader } from "@/components/admin/page-header";

export default function CategoriasPage() {
  return (
    <section>
      <PageHeader title="Categorias" description="Módulo em preparação para operação SaaS do Harmomus." />
      <div className="rounded-xl border border-border bg-surface p-8 text-sm text-muted shadow-premium">
        Estrutura base pronta para integração de regras de negócio, permissões por plano e automações.
      </div>
    </section>
  );
}
