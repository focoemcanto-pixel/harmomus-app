import { revalidatePath } from "next/cache";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { getPublishedKits } from "@/lib/data/public-kits";
import { getAdminHomeFeaturedKits, replaceHomeFeaturedKits } from "@/lib/data/home-featured-kits";
import { setFlashToast } from "@/lib/flash";

function kitLabel(kit: { name: string; artist: string | null }) {
  return `${kit.name}${kit.artist ? ` — ${kit.artist}` : ""}`;
}

export default async function AdminHomeFeaturedKitsPage() {
  const [kits, featuredRows] = await Promise.all([getPublishedKits(), getAdminHomeFeaturedKits()]);
  const selectedIds = featuredRows.map((row) => row.kit_id).filter(Boolean).slice(0, 5);
  const selectedKits = selectedIds.map((id) => kits.find((kit) => kit.id === id)).filter(Boolean) as typeof kits;

  async function saveFeaturedKits(formData: FormData) {
    "use server";
    const kitIds = formData.getAll("kit_id").map((value) => String(value ?? "").trim()).filter(Boolean);

    try {
      await replaceHomeFeaturedKits(kitIds);
      await setFlashToast("success", "Kits em destaque atualizados com sucesso.");
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível salvar os kits em destaque.");
    }

    revalidatePath("/");
    revalidatePath("/admin/home-featured-kits");
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Kits em destaque" description="Escolha até 5 kits para aparecerem na galeria da home, abaixo da enquete e acima das categorias." />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.18em] text-gold-300">Selecionados</p>
          <p className="mt-2 text-3xl font-semibold text-white">{selectedIds.length}/5</p>
          <p className="mt-1 text-sm text-muted">Slots ocupados na home</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Kits publicados</p>
          <p className="mt-2 text-3xl font-semibold text-white">{kits.length}</p>
          <p className="mt-1 text-sm text-muted">Disponíveis para seleção</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Posição</p>
          <p className="mt-2 text-3xl font-semibold text-white">Home</p>
          <p className="mt-1 text-sm text-muted">Depois da enquete</p>
        </div>
      </div>

      <form action={saveFeaturedKits} className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-6">
        <div className="mb-5 border-b border-border/70 pb-5">
          <p className="text-xs uppercase tracking-[0.22em] text-gold-300">Galeria em destaque</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Definir kits da vitrine</h3>
          <p className="mt-1 text-sm text-muted">A ordem dos campos abaixo será a ordem do carrossel público.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((slot) => (
            <label key={slot} className="block rounded-2xl border border-border bg-background/60 p-4">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Slot {slot + 1}</span>
              <select name="kit_id" defaultValue={selectedIds[slot] ?? ""} className="mt-3 w-full rounded-xl border border-border bg-surface-muted px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-300">
                <option value="">Sem kit</option>
                {kits.map((kit) => (
                  <option key={kit.id} value={kit.id}>{kitLabel(kit)}</option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">Evite repetir o mesmo kit; duplicados são removidos automaticamente ao salvar.</p>
          <button type="submit" className="rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-5 py-3 text-sm font-bold text-slate-950 shadow-[0_14px_40px_rgba(34,211,238,0.25)] transition hover:brightness-110">
            Salvar destaque
          </button>
        </div>
      </form>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Prévia da seleção</h3>
        {selectedKits.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {selectedKits.map((kit, index) => (
              <Link key={kit.id} href={`/biblioteca/${kit.slug}`} target="_blank" className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-premium transition hover:border-cyan-300/60">
                {kit.coverUrl ? <img src={kit.coverUrl} alt={kit.name} className="aspect-square w-full object-cover transition group-hover:scale-105" /> : <div className="aspect-square bg-background" />}
                <div className="p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold-300">Destaque {index + 1}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white">{kit.name}</p>
                  <p className="truncate text-xs text-muted">{kit.artist || "Harmomus"}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center text-muted">Nenhum kit selecionado para destaque.</div>
        )}
      </section>
    </section>
  );
}
