import Link from "next/link";
import { revalidatePath } from "next/cache";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { PageHeader } from "@/components/admin/page-header";
import { deleteKit, getKits } from "@/lib/data/kits";

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

function statusBadgeClass(published?: boolean | null) {
  return published
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-amber-400/40 bg-amber-500/10 text-amber-200";
}

export default async function KitsPage() {
  const kits = await getKits();
  const publishedKits = kits.filter((kit) => kit.published).length;
  const draftKits = kits.length - publishedKits;
  const totalFiles = kits.reduce((sum, kit) => sum + Number(kit.file_count ?? 0), 0);
  const kitsWithoutAudio = kits.filter((kit) => Number(kit.file_count ?? 0) === 0).length;

  async function handleDelete(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await deleteKit(id);
    revalidatePath("/admin/kits");
    revalidatePath("/biblioteca");
    revalidatePath("/todos-os-kits");
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Kits Vocais" description="Gerencie publicação, capas, planos e pastas R2 da biblioteca Harmomus." />
        <Link href="/admin/kits/novo" className="inline-flex h-11 items-center justify-center rounded-2xl border border-gold-500/40 bg-gold-500/15 px-5 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25">
          Novo Kit
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Kits</p>
          <p className="mt-2 text-3xl font-semibold text-white">{kits.length}</p>
          <p className="mt-1 text-sm text-muted">Total cadastrado</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Publicados</p>
          <p className="mt-2 text-3xl font-semibold text-white">{publishedKits}</p>
          <p className="mt-1 text-sm text-muted">Visíveis na biblioteca</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Rascunhos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{draftKits}</p>
          <p className="mt-1 text-sm text-muted">Ainda não publicados</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Áudios</p>
          <p className="mt-2 text-3xl font-semibold text-white">{totalFiles}</p>
          <p className="mt-1 text-sm text-muted">{kitsWithoutAudio ? `${kitsWithoutAudio} kit(s) sem áudio` : "Todos com arquivos"}</p>
        </div>
      </div>

      {kits.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gold-500/30 bg-gradient-to-br from-surface to-surface-muted p-10 text-center shadow-premium">
          <p className="text-lg font-medium text-foreground">Nenhum kit vocal cadastrado.</p>
          <p className="mt-2 text-sm text-muted">Crie o primeiro kit para começar a organizar capas, planos e pastas do Cloudflare R2.</p>
          <Link href="/admin/kits/novo" className="mt-5 inline-flex rounded-2xl border border-gold-500/40 bg-gold-500/10 px-5 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20">
            Criar primeiro kit
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {kits.map((kit) => (
            <article key={kit.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                <div className="relative min-h-44 bg-background sm:min-h-full">
                  <img
                    src={kit.cover_url ?? "https://placehold.co/600x400/101114/f4f4f5?text=Sem+capa"}
                    alt={kit.name}
                    className="h-full min-h-44 w-full object-cover"
                  />
                  <span className={`absolute left-3 top-3 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur ${statusBadgeClass(kit.published)}`}>
                    {kit.published ? "Publicado" : "Rascunho"}
                  </span>
                </div>

                <div className="flex min-w-0 flex-col p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate text-xl font-semibold tracking-tight text-white">{kit.name}</h3>
                      <p className="mt-1 truncate text-sm text-muted">{kit.artist || "Artista não informado"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/60 px-3 py-2 text-right text-xs text-muted">
                      Criado em<br />
                      <span className="text-foreground">{formatDate(kit.created_at)}</span>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Categoria</p>
                      <p className="mt-1 font-medium text-foreground">{kit.category_name ?? "Sem categoria"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Plano</p>
                      <p className="mt-1 font-medium text-foreground">{kit.plan_name ?? "Todos"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Áudios</p>
                      <p className="mt-1 font-medium text-foreground">{kit.tone_count} tons • {kit.file_count} arquivos</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Pasta R2</p>
                      <p className="mt-1 truncate font-medium text-foreground" title={kit.r2_folder ?? ""}>{kit.r2_folder ?? "-"}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Link href={`/admin/kits/${kit.id}/editar`} className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-gold-500/40 hover:bg-surface-muted">
                      Editar
                    </Link>
                    <Link href={`/biblioteca/${kit.slug}`} className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-cyan-400/40 hover:bg-cyan-500/10">
                      Ver público
                    </Link>
                    <form action={handleDelete}>
                      <input type="hidden" name="id" value={kit.id} />
                      <ConfirmSubmitButton message={`Tem certeza que deseja excluir o kit \"${kit.name}\"? Esta ação não poderá ser desfeita.`} className="inline-flex w-full items-center justify-center rounded-xl border border-red-500/50 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 sm:w-auto">
                        Excluir
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
