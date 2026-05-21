import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { deleteKit, getKits } from "@/lib/data/kits";

export default async function KitsPage() {
  const kits = await getKits();

  async function handleDelete(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteKit(id);
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between">
        <PageHeader title="Kits Vocais" description="Gerencie kits, publicação e organização por pastas R2." />
        <Link href="/admin/kits/novo" className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20">Novo Kit</Link>
      </div>

      {kits.length === 0 ? (
        <div className="rounded-xl border border-gold-500/30 bg-gradient-to-br from-surface to-surface-muted p-10 text-center shadow-premium">
          <p className="text-lg font-medium text-foreground">Nenhum kit vocal cadastrado.</p>
          <p className="mt-2 text-sm text-muted">Crie o primeiro kit para começar a organizar capas, planos e pastas do Cloudflare R2.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-premium">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-muted">
              <tr>
                <th className="px-4 py-3">Capa</th><th className="px-4 py-3">Nome</th><th className="px-4 py-3">Artista</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Plano</th><th className="px-4 py-3">Pasta R2</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Criado em</th><th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {kits.map((kit) => (
                <tr key={kit.id}>
                  <td className="px-4 py-3"><img src={kit.cover_url ?? "https://placehold.co/150x90/101114/f4f4f5?text=Sem+capa"} alt={kit.name} className="h-12 w-20 rounded border border-border object-cover" /></td>
                  <td className="px-4 py-3 font-medium">{kit.name}</td>
                  <td className="px-4 py-3 text-muted">{kit.artist}</td>
                  <td className="px-4 py-3 text-muted">{kit.category_name ?? "Sem categoria"}</td>
                  <td className="px-4 py-3 text-muted">{kit.required_plan ?? "Todos"}</td>
                  <td className="px-4 py-3 text-muted">{kit.r2_folder ?? "-"}</td>
                  <td className="px-4 py-3"><span className="rounded-full border border-border px-2 py-1 text-xs">{kit.published ? "Publicado" : "Rascunho"}</span></td>
                  <td className="px-4 py-3 text-muted">{new Date(kit.created_at).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link href={`/admin/kits/${kit.id}/editar`} className="rounded-md border border-border px-2 py-1 text-xs text-foreground">Editar</Link>
                      <form action={handleDelete}><input type="hidden" name="id" value={kit.id} /><button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300">Excluir</button></form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
