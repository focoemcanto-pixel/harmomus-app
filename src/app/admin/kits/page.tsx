import Link from "next/link";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { getKits } from "@/lib/data/kits";

function formatDate(value?: string | null) {
  return formatDateTimeBR(value);
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

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="flex flex-row items-start justify-between gap-3 sm:items-end">
        <PageHeader title="Kits Vocais" description="Gerencie publicação, capas, planos e pastas R2 da biblioteca Harmomus." />
        <Link href="/admin/kits/novo" className="inline-flex h-10 shrink-0 items-center justify-center rounded-2xl border border-gold-500/40 bg-gold-500/15 px-4 text-xs font-semibold text-gold-200 transition hover:bg-gold-500/25 sm:h-11 sm:px-5 sm:text-sm">
          Novo Kit
        </Link>
      </div>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-4 md:px-0">
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold-300 sm:text-xs">Kits</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{kits.length}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Total cadastrado</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 sm:text-xs">Publicados</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{publishedKits}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Visíveis</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300 sm:text-xs">Rascunhos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{draftKits}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Não publicados</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 sm:text-xs">Áudios</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{totalFiles}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">{kitsWithoutAudio ? `${kitsWithoutAudio} sem áudio` : "Todos com arquivos"}</p>
        </div>
      </div>

      {kits.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gold-500/30 bg-gradient-to-br from-surface to-surface-muted p-8 text-center shadow-premium sm:p-10">
          <p className="text-lg font-medium text-foreground">Nenhum kit vocal cadastrado.</p>
          <p className="mt-2 text-sm text-muted">Crie o primeiro kit para começar a organizar capas, planos e pastas do Cloudflare R2.</p>
          <Link href="/admin/kits/novo" className="mt-5 inline-flex rounded-2xl border border-gold-500/40 bg-gold-500/10 px-5 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20">
            Criar primeiro kit
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {kits.map((kit) => (
            <article key={kit.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                <div className="relative h-36 bg-background sm:h-auto sm:min-h-full">
                  <img
                    src={kit.cover_url ?? "https://placehold.co/600x400/101114/f4f4f5?text=Sem+capa"}
                    alt={kit.name}
                    className="h-full w-full object-cover"
                  />
                  <span className={`absolute left-3 top-3 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur ${statusBadgeClass(kit.published)}`}>
                    {kit.published ? "Publicado" : "Rascunho"}
                  </span>
                </div>

                <div className="flex min-w-0 flex-col p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">{kit.name}</h3>
                      <p className="mt-1 truncate text-sm text-muted">{kit.artist || "Artista não informado"}</p>
                    </div>
                    <div className="hidden rounded-2xl border border-border bg-background/60 px-3 py-2 text-right text-xs text-muted sm:block">
                      Criado em<br />
                      <span className="text-foreground">{formatDate(kit.created_at)}</span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted sm:text-xs">Categoria</p>
                      <p className="mt-1 truncate font-medium text-foreground">{kit.category_name ?? "Sem categoria"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted sm:text-xs">Plano</p>
                      <p className="mt-1 truncate font-medium text-foreground">{kit.plan_name ?? "Todos"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted sm:text-xs">Áudios</p>
                      <p className="mt-1 font-medium text-foreground">{kit.tone_count} tons • {kit.file_count}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background/50 p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-muted sm:text-xs">R2</p>
                      <p className="mt-1 truncate font-medium text-foreground" title={kit.r2_folder ?? ""}>{kit.r2_folder ?? "-"}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Link href={`/admin/kits/${kit.id}/editar`} className="inline-flex items-center justify-center rounded-xl border border-gold-500/40 bg-gold-500/10 px-4 py-2.5 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/20">
                      Gerenciar
                    </Link>
                    <Link href={`/admin/kits/${kit.id}/artes`} className="inline-flex items-center justify-center rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20">
                      Arte
                    </Link>
                    <Link href={`/biblioteca/${kit.slug}`} className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-cyan-400/40 hover:bg-cyan-500/10">
                      Ver público
                    </Link>
                    <form action="/api/admin/kits/delete" method="post" className="contents sm:block">
                      <input type="hidden" name="id" value={kit.id} />
                      <input type="hidden" name="name" value={kit.name} />
                      <ConfirmSubmitButton message={`Tem certeza que deseja excluir o kit "${kit.name}"? Esta ação não poderá ser desfeita.`} className="inline-flex w-full items-center justify-center rounded-xl border border-red-500/50 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 sm:w-auto">
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
