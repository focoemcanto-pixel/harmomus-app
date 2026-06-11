import { revalidatePath } from "next/cache";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { PageHeader } from "@/components/admin/page-header";
import { formatDateTimeBR } from "@/lib/format-date-time-br";
import { deleteHomeBanner, getAdminHomeBanners, updateHomeBanner } from "@/lib/data/home-banners";
import { setFlashToast } from "@/lib/flash";

function formatDateTime(value?: string | null) {
  return value ? formatDateTimeBR(value) : "Sem agenda";
}

function statusBadgeClass(active?: boolean | null) {
  return active
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
}

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12";
const labelClass = "text-xs font-medium text-muted sm:text-sm";

export default async function AdminBannersPage() {
  const banners = await getAdminHomeBanners();
  const activeBanners = banners.filter((banner: any) => banner.is_active).length;
  const scheduledBanners = banners.filter((banner: any) => banner.starts_at || banner.ends_at).length;
  const mobileReadyBanners = banners.filter((banner: any) => banner.mobile_image_url).length;

  async function saveBanner(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const payload = {
      title,
      subtitle: String(formData.get("subtitle") ?? "").trim(),
      image_url: String(formData.get("image_url") ?? "").trim(),
      mobile_image_url: String(formData.get("mobile_image_url") ?? "").trim() || null,
      button_label: String(formData.get("button_label") ?? "").trim(),
      button_href: String(formData.get("button_href") ?? "").trim(),
      type: String(formData.get("type") ?? "campanha"),
      is_active: formData.get("is_active") === "on",
      sort_order: Number(formData.get("sort_order") ?? 0),
      starts_at: String(formData.get("starts_at") ?? "") || null,
      ends_at: String(formData.get("ends_at") ?? "") || null,
    };

    try {
      if (!id) {
        const { createHomeBanner } = await import("@/lib/data/home-banners");
        await createHomeBanner(payload);
        await setFlashToast("success", `Banner ${title || "sem título"} criado com sucesso.`);
      } else {
        await updateHomeBanner(id, payload);
        await setFlashToast("success", `Banner ${title || "sem título"} atualizado com sucesso.`);
      }
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível salvar o banner.");
    }

    revalidatePath("/");
    revalidatePath("/admin/banners");
  }

  async function removeBanner(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const title = String(formData.get("title") ?? "").trim();

    try {
      await deleteHomeBanner(id);
      await setFlashToast("success", `Banner ${title || "selecionado"} excluído com sucesso.`);
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível excluir o banner.");
    }

    revalidatePath("/");
    revalidatePath("/admin/banners");
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Banners da Home" description="Gerencie o carrossel premium da primeira dobra do Harmomus." />

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold-300 sm:text-xs">Banners</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{banners.length}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Total cadastrado</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 sm:text-xs">Ativos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{activeBanners}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Disponíveis na home</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 sm:text-xs">Mobile</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{mobileReadyBanners}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">{scheduledBanners ? `${scheduledBanners} com agenda` : "Sem agendas"}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-6">
        <div className="mb-4 border-b border-border/70 pb-4 sm:mb-5 sm:pb-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-gold-300 sm:text-xs sm:tracking-[0.22em]">Novo banner</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-xl">Criar destaque da home</h3>
          <p className="mt-1 text-xs text-muted sm:text-sm">Use imagens otimizadas para desktop e, quando possível, uma versão recortada para mobile.</p>
        </div>
        <BannerForm action={saveBanner} />
      </div>

      {banners.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center shadow-premium sm:p-10">
          <p className="text-lg font-semibold text-white">Nenhum banner cadastrado</p>
          <p className="mt-2 text-sm text-muted">Crie um banner para destacar campanhas, kits ou chamadas importantes na home.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {banners.map((banner: any) => (
            <article key={banner.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <div className="relative min-h-40 bg-background sm:min-h-56">
                <img
                  src={banner.image_url || "https://placehold.co/900x420/101114/f4f4f5?text=Sem+imagem"}
                  alt={banner.title || "Banner"}
                  className="h-full min-h-40 w-full object-cover sm:min-h-56"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5 sm:mb-3 sm:gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em] ${statusBadgeClass(banner.is_active)}`}>
                      {banner.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold-100 backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">{banner.type}</span>
                    {banner.mobile_image_url ? <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100 backdrop-blur sm:px-3 sm:text-[11px] sm:tracking-[0.14em]">Mobile ok</span> : null}
                  </div>
                  <h3 className="line-clamp-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">{banner.title || "Sem título"}</h3>
                  <p className="mt-1 line-clamp-1 max-w-2xl text-xs text-white/75 sm:text-sm">{banner.subtitle || "Sem subtítulo"}</p>
                </div>
              </div>

              <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
                <div className="grid gap-2 text-xs sm:gap-3 sm:text-sm md:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background/50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted sm:text-xs sm:tracking-[0.16em]">Ordem</p>
                    <p className="mt-1 font-medium text-foreground">{banner.sort_order ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/50 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted sm:text-xs sm:tracking-[0.16em]">Agenda</p>
                    <p className="mt-1 font-medium text-foreground">{formatDateTime(banner.starts_at)}</p>
                  </div>
                </div>

                <BannerForm action={saveBanner} banner={banner} />

                <form action={removeBanner} className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 sm:p-4">
                  <input type="hidden" name="id" value={banner.id} />
                  <input type="hidden" name="title" value={banner.title || ""} />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-200">Zona de risco</p>
                      <p className="mt-1 text-xs text-red-100/70">Excluir remove este banner da administração e da home.</p>
                    </div>
                    <ConfirmSubmitButton title="Excluir banner?" confirmLabel="Sim, excluir banner" message={`Tem certeza que deseja excluir o banner "${banner.title || "sem título"}"?`} className="rounded-xl border border-red-400/60 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/10">
                      Excluir banner
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

function BannerForm({ action, banner }: { action: (data: FormData) => Promise<void>; banner?: any }) {
  return (
    <form action={action} className="grid gap-3 text-sm md:grid-cols-2">
      <input type="hidden" name="id" defaultValue={banner?.id ?? ""} />

      <label className={labelClass}>Título
        <input name="title" defaultValue={banner?.title ?? ""} placeholder="Título" className={inputClass} />
      </label>
      <label className={labelClass}>Subtítulo
        <input name="subtitle" defaultValue={banner?.subtitle ?? ""} placeholder="Subtítulo" className={inputClass} />
      </label>
      <label className={labelClass}>Imagem desktop URL
        <input name="image_url" defaultValue={banner?.image_url ?? ""} placeholder="https://..." className={inputClass} required />
      </label>
      <label className={labelClass}>Imagem mobile URL
        <input name="mobile_image_url" defaultValue={banner?.mobile_image_url ?? ""} placeholder="https://..." className={inputClass} />
      </label>
      <label className={labelClass}>Texto do botão
        <input name="button_label" defaultValue={banner?.button_label ?? ""} placeholder="Ex.: Conhecer agora" className={inputClass} />
      </label>
      <label className={labelClass}>Link do botão
        <input name="button_href" defaultValue={banner?.button_href ?? ""} placeholder="/biblioteca" className={inputClass} />
      </label>
      <label className={labelClass}>Tipo
        <select name="type" defaultValue={banner?.type ?? "campanha"} className={inputClass}>
          <option>kit</option>
          <option>lançamento</option>
          <option>curso</option>
          <option>anúncio</option>
          <option>campanha</option>
        </select>
      </label>
      <label className={labelClass}>Ordem
        <input name="sort_order" type="number" defaultValue={banner?.sort_order ?? 0} className={inputClass} />
      </label>
      <label className={labelClass}>Início
        <input name="starts_at" type="datetime-local" defaultValue={banner?.starts_at?.slice(0, 16) ?? ""} className={inputClass} />
      </label>
      <label className={labelClass}>Fim
        <input name="ends_at" type="datetime-local" defaultValue={banner?.ends_at?.slice(0, 16) ?? ""} className={inputClass} />
      </label>
      <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-3 text-sm text-muted md:col-span-2">
        <input name="is_active" type="checkbox" defaultChecked={banner?.is_active ?? true} />
        Banner ativo na home
      </label>
      <button className="rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25 md:col-span-2">
        {banner ? "Salvar banner" : "Criar banner"}
      </button>
    </form>
  );
}
