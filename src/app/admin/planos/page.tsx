import { revalidatePath } from "next/cache";

import { PageHeader } from "@/components/admin/page-header";
import { getPlans, updatePlan } from "@/lib/data/plans";
import { setFlashToast } from "@/lib/flash";

function formatCurrency(cents?: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents ?? 0) / 100);
}

function statusBadgeClass(status?: string | null) {
  return status === "active"
    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
    : "border-red-400/40 bg-red-500/10 text-red-200";
}

function normalizeFeatures(rawValue: FormDataEntryValue | null) {
  const value = String(rawValue ?? "[]").trim();
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("O campo de recursos precisa estar em JSON válido. Exemplo: [\"Recurso 1\", \"Recurso 2\"]");
  }
}

export default async function AdminPlanosPage() {
  const plans = await getPlans();
  const activePlans = plans.filter((plan) => plan.status === "active").length;
  const paidPlans = plans.filter((plan) => Number(plan.price_cents ?? 0) > 0).length;
  const plansWithoutStripe = plans.filter((plan) => ["plus", "premium"].includes(plan.slug) && !plan.stripe_price_id).length;

  async function savePlan(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const name = String(formData.get("name") ?? "").trim();

    try {
      const features = normalizeFeatures(formData.get("features_json"));

      await updatePlan(id, {
        name,
        slug: String(formData.get("slug") ?? ""),
        price_cents: Number(formData.get("price_cents") ?? 0),
        description: String(formData.get("description") ?? ""),
        trial_days: formData.get("trial_enabled") === "on" ? Number(formData.get("trial_days") ?? 0) : 0,
        stripe_price_id: String(formData.get("stripe_price_id") ?? "") || null,
        hierarchy_level: Number(formData.get("hierarchy_level") ?? 0),
        status: String(formData.get("status") ?? "active") as "active" | "inactive",
        features,
        updated_at: new Date().toISOString(),
      });

      await setFlashToast("success", `Plano ${name || "selecionado"} atualizado com sucesso.`);
    } catch (error) {
      await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível salvar o plano.");
    }

    revalidatePath("/admin/planos");
    revalidatePath("/assinar");
    revalidatePath("/");
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Central de Planos" description="Gerencie preços, acesso e configuração dos planos exibidos na assinatura." />

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gold-300 sm:text-xs">Planos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{plans.length}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Total cadastrado</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300 sm:text-xs">Ativos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{activePlans}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">Disponíveis</p>
        </div>
        <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300 sm:text-xs">Pagos</p>
          <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{paidPlans}</p>
          <p className="mt-1 text-xs text-muted sm:text-sm">{plansWithoutStripe ? `${plansWithoutStripe} sem Stripe` : "Sem alertas"}</p>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-8 text-center shadow-premium sm:p-10">
          <p className="text-lg font-semibold text-white">Nenhum plano encontrado</p>
          <p className="mt-2 text-sm text-muted">Cadastre planos no banco antes de configurar a oferta pública.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plans.map((plan) => (
            <form key={plan.id} action={savePlan} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <input type="hidden" name="id" value={plan.id} />

              <div className="border-b border-border/70 bg-gradient-to-br from-surface-muted to-background p-4 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">{plan.name}</h3>
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] sm:text-[11px] ${statusBadgeClass(plan.status)}`}>{plan.status}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted sm:text-sm">Slug: <span className="text-foreground">{plan.slug}</span></p>
                  </div>
                  <div className="shrink-0 rounded-2xl border border-gold-500/20 bg-gold-500/10 px-3 py-2 text-right sm:px-4 sm:py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-gold-300 sm:text-xs">Preço</p>
                    <p className="mt-1 text-sm font-semibold text-gold-100 sm:text-lg">{formatCurrency(plan.price_cents)}</p>
                  </div>
                </div>
                {["plus", "premium"].includes(plan.slug) && !plan.stripe_price_id ? (
                  <p className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 sm:text-sm">Plano pago sem Stripe Price ID. O checkout pode não funcionar corretamente.</p>
                ) : null}
              </div>

              <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-muted sm:text-sm">Nome
                    <input name="name" defaultValue={plan.name} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" />
                  </label>
                  <label className="text-xs text-muted sm:text-sm">Slug
                    <input name="slug" defaultValue={plan.slug} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" />
                  </label>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-xs text-muted sm:text-sm">Preço em centavos
                    <input name="price_cents" type="number" defaultValue={plan.price_cents} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" />
                  </label>
                  <label className="text-xs text-muted sm:text-sm">Nível
                    <input name="hierarchy_level" type="number" defaultValue={plan.hierarchy_level} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" />
                  </label>
                  <label className="text-xs text-muted sm:text-sm">Status
                    <select name="status" defaultValue={plan.status} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12">
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </label>
                </div>

                <label className="text-xs text-muted sm:text-sm">Descrição
                  <input name="description" defaultValue={plan.description ?? ""} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" />
                </label>

                <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                  <label className="text-xs text-muted sm:text-sm">Stripe Price ID
                    <input name="stripe_price_id" defaultValue={plan.stripe_price_id ?? ""} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" placeholder="price_..." />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted md:mt-6">
                    <input type="checkbox" name="trial_enabled" defaultChecked={plan.trial_days > 0} />
                    Trial ativo
                  </label>
                </div>

                <label className="text-xs text-muted sm:text-sm">Dias de trial
                  <input name="trial_days" type="number" defaultValue={plan.trial_days} className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-white outline-none transition focus:border-gold-500/50 sm:mt-2 sm:h-12" />
                </label>

                <label className="text-xs text-muted sm:text-sm">Recursos do plano em JSON
                  <textarea name="features_json" rows={4} defaultValue={JSON.stringify(plan.features ?? [], null, 2)} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-xs text-white outline-none transition focus:border-gold-500/50 sm:mt-2" />
                </label>

                <button className="w-full rounded-2xl border border-gold-500/30 bg-gold-500/15 px-4 py-3 text-sm font-semibold text-gold-200 transition hover:bg-gold-500/25">Salvar plano</button>
              </div>
            </form>
          ))}
        </div>
      )}
    </section>
  );
}
