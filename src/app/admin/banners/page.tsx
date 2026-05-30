import { revalidatePath } from "next/cache";

import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { PageHeader } from "@/components/admin/page-header";
import { deleteHomeBanner, getAdminHomeBanners, updateHomeBanner } from "@/lib/data/home-banners";

function formatDateTime(value?: string | null) {
  if (!value) return "Sem agenda";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return "Sem agenda";
  }
}

function statusBadgeClass(active?: boolean | null) {
  return active
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
}

export default async function AdminBannersPage() {
  const banners = await getAdminHomeBanners();
  const activeBanners = banners.filter((banner: any) => banner.is_active).length;
  const scheduledBanners = banners.filter((banner: any) => banner.starts_at || banner.ends_at).length;
  const mobileReadyBanners = banners.filter((banner: any) => banner.mobile_image_url).length;

  async function saveBanner(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const payload = {
      title: String(formData.get("title") ?? "").trim(),
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

    if (!id) {
      const { createHomeBanner } = await import("@/lib/data/home-banners");
      await createHomeBanner(payload);
    } else {
      await updateHomeBanner(id, payload);
    }

    revalidatePath("/");
    revalidatePath("/admin/banners");
  }

  async function removeBanner(formData: FormData) {
    "use server";
    await deleteHomeBanner(String(formData.get("id") ?? ""));
    revalidatePath("/");
    revalidatePath("/admin/banners");
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Banners da Home" description="Gerencie o carrossel premium da primeira dobra do Harmomus." />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Banners</p>
          <p className="mt-2 text-3xl font-semibold text-white">{banners.length}</p>
          <p className="mt-1 text-sm text-muted">Total cadastrado</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Ativos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeBanners}</p>
          <p className="mt-1 text-sm text-muted">Disponíveis na home</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Mobile</p>
          <p className="mt-2 text-3xl font-semibold text-white">{mobileReadyBanners}</p>
          <p className="mt-1 text-sm text-muted">{scheduledBanners ? `${scheduledBanners} com agenda` : "Sem agendas configuradas"}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium sm:p-6">
        <div className="mb-5 border-b border-border/70 pb-5">
          <p className="text-xs uppercase tracking-[0.22em] text-gold-300">Novo banner</p>
          <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">Criar destaque da home</h3>
          <p className="mt-1 text-sm text-muted">Use imagens otimizadas para desktop e, quando possível, uma versão vertical ou recortada para mobile.</p>
        </div>
        <BannerForm action={saveBanner} />
      </div>

      {banners.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center shadow-premium">
          <p className="text-lg font-semibold text-white">Nenhum banner cadastrado</p>
          <p className="mt-2 text-sm text-muted">Crie um banner para destacar campanhas, kits ou chamadas importantes na home.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {banners.map((banner: any) => (
            <article key={banner.id} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <div className="relative min-h-56 bg-background">
                <img
                  src={banner.image_url || "https://placehold.co/900x420/101114/f4f4f5?text=Sem+imagem"}
                  alt={banner.title || "Banner"}
                  className="h-full min-h-56 w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] backdrop-blur ${statusBadgeClass(banner.is_active)}`}>
                      {banner.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <span className="rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-100 backdrop-blur">{banner.type}</span>
                    {banner.mobile_image_url ? <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 backdrop-blur">Mobile ok</span> : null}
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight text-white">{banner.title || "Sem título"}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-white/75">{banner.subtitle || "Sem subtítulo"}</p>
                </div>
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background/50 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted">Ordem</p>
                    <p className="mt-1 font-medium text-foreground">{banner.sort_order ?? 0}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background/50 p-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted">Agenda</p>
                    <p className="mt-1 font-medium text-foreground">{formatDateTime(banner.starts_at)}</p>
                  </div>
                </div>

                <BannerForm action={saveBanner} banner={banner} />

                <form action={removeBanner} className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                  <input type="hidden" name="id" value={banner.id} />
                  <p className="text-sm font-semibold text-red-200">Zona de risco</p>
                  <p className="mt-1 text-xs text-red-100/70">Excluir remove este banner da administração e da home.</p>
                  <ConfirmSubmitButton message={`Tem certeza que deseja excluir o banner \"${banner.title || "sem título"}\"?`} className="mt-3 rounded-xl border border-red-400/60 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/10">
                    Excluir banner
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

function BannerForm({ action, banner }: { action: (data: FormData) => Promise<void>; banner?: any }) {
  return (
    <form action={action} className="grid gap-4 text-sm md:grid-cols-2">
      <input type="hidden" name="id" defaultValue={banner?.id ?? ""} />

      <label className="text-sm text-muted">Título
        <input name="title" defaultValue={banner?.title ?? ""} placeholder="Título" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Subtítulo
        <input name="subtitle" defaultValue={banner?.subtitle ?? ""} placeholder="Subtítulo" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Imagem desktop URL
        <input name="image_url" defaultValue={banner?.image_url ?? ""} placeholder="https://..." className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" required />
      </label>
      <label className="text-sm text-muted">Imagem mobile URL
        <input name="mobile_image_url" defaultValue={banner?.mobile_image_url ?? ""} placeholder="https://..." className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Texto do botão
        <input name="button_label" defaultValue={banner?.button_label ?? ""} placeholder="Ex.: Conhecer agora" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Link do botão
        <input name="button_href" defaultValue={banner?.button_href ?? ""} placeholder="/biblioteca" className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Tipo
        <select name="type" defaultValue={banner?.type ?? "campanha"} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50">
          <option>kit</option>
          <option>lançamento</option>
          <option>curso</option>
          <option>anúncio</option>
          <option>campanha</option>
        </select>
      </label>
      <label className="text-sm text-muted">Ordem
        <input name="sort_order" type="number" defaultValue={banner?.sort_order ?? 0} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Início
        <input name="starts_at" type="datetime-local" defaultValue={banner?.starts_at?.slice(0, 16) ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="text-sm text-muted">Fim
        <input name="ends_at" type="datetime-local" defaultValue={banner?.ends_at?.slice(0, 16) ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
      </label>
      <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted md:col-span-2">
        <input name="is_active" type="checkbox" defaultChecked={banner?.is_active ?? true} />
        Banner ativo na home
      </label>
      <button className="rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25 md:col-span-2">
        {banner ? "Salvar banner" : "Criar banner"}
      </button>
    </form>
  );
}
