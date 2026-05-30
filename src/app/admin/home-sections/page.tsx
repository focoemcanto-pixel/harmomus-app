import { revalidatePath } from "next/cache";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { HomeSectionForm } from "@/components/admin/home-section-form";
import { PageHeader } from "@/components/admin/page-header";
import { createHomeSection, deleteHomeSection, getAdminHomeSections, updateHomeSection } from "@/lib/data/home-sections";

function statusBadgeClass(active?: boolean | null) {
  return active
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
}

export default async function AdminHomeSectionsPage() {
  const sections = await getAdminHomeSections();
  const activeSections = sections.filter((section: any) => section.active).length;
  const sectionsWithImage = sections.filter((section: any) => section.image_url).length;
  const sectionsWithButton = sections.filter((section: any) => section.button_text && section.button_link).length;

  async function saveSection(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const payload = {
      type: String(formData.get("type") ?? "course_highlight").trim(),
      title: String(formData.get("title") ?? "").trim(),
      subtitle: String(formData.get("subtitle") ?? "").trim(),
      image_url: String(formData.get("image_url") ?? "").trim(),
      button_text: String(formData.get("button_text") ?? "").trim(),
      button_link: String(formData.get("button_link") ?? "").trim(),
      active: formData.get("active") === "on",
      order_index: Number(formData.get("order_index") ?? 0),
    };

    if (!id) await createHomeSection(payload);
    else await updateHomeSection(id, payload);

    revalidatePath("/");
    revalidatePath("/admin/home-sections");
  }

  async function removeSection(formData: FormData) {
    "use server";
    await deleteHomeSection(String(formData.get("id") ?? ""));
    revalidatePath("/");
    revalidatePath("/admin/home-sections");
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Blocos promocionais" description="Gerencie as seções de destaque da home com ordem, imagens, textos e chamadas." />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Blocos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{sections.length}</p>
          <p className="mt-1 text-sm text-muted">Total cadastrado</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Ativos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeSections}</p>
          <p className="mt-1 text-sm text-muted">Visíveis na home</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Completos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{sectionsWithButton}</p>
          <p className="mt-1 text-sm text-muted">{sectionsWithImage} com imagem</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
        <div className="mb-5 border-b border-border/70 pb-5">
          <p className="text-xs uppercase tracking-[0.22em] text-gold-300">Novo bloco</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Criar seção promocional</h3>
          <p className="mt-1 text-sm text-muted">Use os blocos para destacar ofertas, cursos, coleções e chamadas estratégicas na home.</p>
        </div>
        <HomeSectionForm action={saveSection} />
      </div>

      {sections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center shadow-premium">
          <p className="text-lg font-semibold text-white">Nenhum bloco cadastrado</p>
          <p className="mt-2 text-sm text-muted">Crie blocos promocionais para organizar melhor a vitrine da home.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {sections.map((section: any) => (
            <article key={section.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <div className="relative min-h-52 bg-background">
                <img
                  src={section.image_url || "https://placehold.co/900x420/101114/f4f4f5?text=Sem+imagem"}
                  alt={section.title || "Bloco promocional"}
                  className="h-full min-h-52 w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur ${statusBadgeClass(section.active)}`}>
                      {section.active ? "Ativo" : "Inativo"}
                    </span>
                    <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-100 backdrop-blur">{section.type}</span>
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 backdrop-blur">Ordem {section.order_index ?? 0}</span>
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight text-white">{section.title || "Sem título"}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-white/75">{section.subtitle || "Sem subtítulo"}</p>
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <HomeSectionForm action={saveSection} section={section} />

                <form action={removeSection} className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                  <input type="hidden" name="id" value={section.id} />
                  <p className="text-sm font-semibold text-red-200">Zona de risco</p>
                  <p className="mt-1 text-xs text-red-100/70">Excluir remove este bloco da administração e da home.</p>
                  <ConfirmSubmitButton message={`Tem certeza que deseja excluir o bloco \"${section.title || "sem título"}\"?`} className="mt-3 rounded-xl border border-red-400/60 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/10">
                    Excluir bloco
                  </ConfirmSubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
