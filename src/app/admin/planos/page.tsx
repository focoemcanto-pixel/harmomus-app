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
    <section className="space-y-6">
      <PageHeader title="Central de Planos" description="Gerencie preços, acesso e configuração dos planos exibidos na assinatura." />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Planos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{plans.length}</p>
          <p className="mt-1 text-sm text-muted">Total cadastrado</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Ativos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{activePlans}</p>
          <p className="mt-1 text-sm text-muted">Disponíveis para uso</p>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-5 shadow-premium">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Pagos</p>
          <p className="mt-2 text-3xl font-semibold text-white">{paidPlans}</p>
          <p className="mt-1 text-sm text-muted">{plansWithoutStripe ? `${plansWithoutStripe} sem Stripe Price ID` : "Integração sem alertas"}</p>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center shadow-premium">
          <p className="text-lg font-semibold text-white">Nenhum plano encontrado</p>
          <p className="mt-2 text-sm text-muted">Cadastre planos no banco antes de configurar a oferta pública.</p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {plans.map((plan) => (
            <form key={plan.id} action={savePlan} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-premium">
              <input type="hidden" name="id" value={plan.id} />

              <div className="border-b border-border/70 bg-gradient-to-br from-surface-muted to-background p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-semibold tracking-tight text-white">{plan.name}</h3>
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusBadgeClass(plan.status)}`}>{plan.status}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">Slug: <span className="text-foreground">{plan.slug}</span></p>
                  </div>
                  <div className="rounded-2xl border border-gold-500/20 bg-gold-500/10 px-4 py-3 text-right">
                    <p className="text-xs uppercase tracking-[0.18em] text-gold-300">Preço</p>
                    <p className="mt-1 text-lg font-semibold text-gold-100">{formatCurrency(plan.price_cents)}</p>
                  </div>
                </div>
                {["plus", "premium"].includes(plan.slug) && !plan.stripe_price_id ? (
                  <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Plano pago sem Stripe Price ID. O checkout pode não funcionar corretamente para este plano.</p>
                ) : null}
              </div>

              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-muted">Nome
                    <input name="name" defaultValue={plan.name} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                  </label>
                  <label className="text-sm text-muted">Slug
                    <input name="slug" defaultValue={plan.slug} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm text-muted">Preço em centavos
                    <input name="price_cents" type="number" defaultValue={plan.price_cents} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                  </label>
                  <label className="text-sm text-muted">Nível de acesso
                    <input name="hierarchy_level" type="number" defaultValue={plan.hierarchy_level} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                  </label>
                  <label className="text-sm text-muted">Status
                    <select name="status" defaultValue={plan.status} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50">
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </label>
                </div>

                <label className="text-sm text-muted">Descrição
                  <input name="description" defaultValue={plan.description ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                </label>

                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <label className="text-sm text-muted">Stripe Price ID
                    <input name="stripe_price_id" defaultValue={plan.stripe_price_id ?? ""} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" placeholder="price_..." />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted md:mt-7">
                    <input type="checkbox" name="trial_enabled" defaultChecked={plan.trial_days > 0} />
                    Trial ativo
                  </label>
                </div>

                <label className="text-sm text-muted">Dias de trial
                  <input name="trial_days" type="number" defaultValue={plan.trial_days} className="mt-2 h-12 w-full rounded-xl border border-border bg-background px-3 text-white outline-none transition focus:border-gold-500/50" />
                </label>

                <label className="text-sm text-muted">Recursos do plano em JSON
                  <textarea name="features_json" rows={5} defaultValue={JSON.stringify(plan.features ?? [], null, 2)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-xs text-white outline-none transition focus:border-gold-500/50" />
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
