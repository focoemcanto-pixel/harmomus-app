import { revalidatePath } from "next/cache";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { HomeSectionForm } from "@/components/admin/home-section-form";
import { PageHeader } from "@/components/admin/page-header";
import { createHomeSection, deleteHomeSection, getAdminHomeSections, updateHomeSection } from "@/lib/data/home-sections";
import { setFlashToast } from "@/lib/flash";

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
    const title = String(formData.get("title") ?? "").trim();
    const payload = {
      type: String(formData.get("type") ?? "course_highlight").trim(),
      title,
      subtitle: String(formData.get("subtitle") ?? "").trim(),
      image_url: String(formData.get("image_url") ?? "").trim(),
      button_text: String(formData.get("button_text") ?? "").trim(),
      button_link: String(formData.get("button_link") ?? "").trim(),
      active: formData.get("active") === "on",
      order_index: Number(formData.get("order_index") ?? 0),
    };

    try {
      if (!id) {
        await createHomeSection(payload);
        await setFlashToast("success", `Bloco ${title || "sem título"} criado com sucesso.`);
      } else {
        await updateHomeSection(id, payload);
        await setFlashToast("success", `Bloco ${title || "sem título"} atualizado com sucesso.`);
      }
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível salvar o bloco.");
    }

    revalidatePath("/");
    revalidatePath("/admin/home-sections");
  }

  async function removeSection(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();

    try {
      await deleteHomeSection(id);
      await setFlashToast("success", `Bloco ${title || "selecionado"} excluído com sucesso.`);
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível excluir o bloco.");
    }

    revalidatePath("/");
    revalidatePath("/admin/home-sections");
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Blocos promocionais" description="Gerencie as seções de destaque da home com ordem, imagens, textos e chamadas." />

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold-300 sm:text-xs">Blocos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{sections.length}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Total cadastrado</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 sm:text-xs">Ativos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{activeSections}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Visíveis na home</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 sm:text-xs">Completos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{sectionsWithButton}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">{sectionsWithImage} com imagem</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-6">
        <div className="mb-4 border-b border-border/70 pb-4 sm:mb-5 sm:pb-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-300 sm:text-xs sm:tracking-[0.22em]">Novo bloco</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-xl">Criar seção promocional</h3>
          <p className="mt-1 text-xs text-muted sm:text-sm">Use os blocos para destacar ofertas, cursos, coleções e chamadas estratégicas na home.</p>
        </div>
        <HomeSectionForm action={saveSection} />
      </div>

      {sections.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center shadow-premium sm:p-10">
          <p className="text-lg font-semibold text-white">Nenhum bloco cadastrado</p>
          <p className="mt-2 text-sm text-muted">Crie blocos promocionais para organizar melhor a vitrine da home.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sections.map((section: any) => (
            <article key={section.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <div className="relative min-h-40 bg-background sm:min-h-52">
                <img
                  src={section.image_url || "https://placehold.co/900x420/101114/f4f4f5?text=Sem+imagem"}
                  alt={section.title || "Bloco promocional"}
                  className="h-full min-h-40 w-full object-cover sm:min-h-52"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:mb-3 sm:gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em] ${statusBadgeClass(section.active)}`}>
                      {section.active ? "Ativo" : "Inativo"}
                    </span>
                    <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-100 backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">{section.type}</span>
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100 backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">Ordem {section.order_index ?? 0}</span>
                  </div>
                  <h3 className="line-clamp-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{section.title || "Sem título"}</h3>
                  <p className="mt-1 line-clamp-1 max-w-2xl text-xs text-white/75 sm:text-sm">{section.subtitle || "Sem subtítulo"}</p>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
                <HomeSectionForm action={saveSection} section={section} />

                <form action={removeSection} className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 sm:p-4">
                  <input type="hidden" name="id" value={section.id} />
                  <input type="hidden" name="title" value={section.title || ""} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-200">Zona de risco</p>
                      <p className="mt-1 text-xs text-red-100/70">Excluir remove este bloco da administração e da home.</p>
                    </div>
                    <ConfirmSubmitButton title="Excluir bloco?" confirmLabel="Sim, excluir bloco" message={`Tem certeza que deseja excluir o bloco "${section.title || "sem título"}"?`} className="rounded-xl border border-red-400/60 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/10">
                      Excluir bloco
                    </ConfirmSubmitButton>
                  </div>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
