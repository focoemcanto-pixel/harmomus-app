import { PageHeader } from "@/components/admin/page-header";

export default function KitsPage() {
  return (
    <section>
      <PageHeader title="Kits Vocais" description="CRUD de kits com suporte a planos, R2 e publicação." actionLabel="Novo Kit" />

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-premium">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-surface-muted text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Artista</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Plano</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-4 py-8 text-center text-muted" colSpan={5}>
                Nenhum kit cadastrado. Estrutura de CRUD pronta para integração com Supabase.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
