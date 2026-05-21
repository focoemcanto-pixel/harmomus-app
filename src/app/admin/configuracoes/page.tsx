import { PageHeader } from "@/components/admin/page-header";

export default function ConfiguracoesPage() {
  return (
    <section>
      <PageHeader title="Configurações" description="Preferências administrativas e parâmetros operacionais da Central Admin." />
      <div className="rounded-xl border border-border bg-surface p-8 text-sm text-muted shadow-premium">
        Módulo pronto para armazenar configurações globais, integrações e regras internas.
      </div>
    </section>
  );
}
