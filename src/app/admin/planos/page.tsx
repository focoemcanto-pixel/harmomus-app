import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/admin/page-header";
import { getPlans, updatePlan } from "@/lib/data/plans";

export default async function AdminPlanosPage() {
  const plans = await getPlans();

  async function savePlan(formData: FormData) {
    "use server";
    const id = String(formData.get("id") ?? "");
    const features = JSON.parse(String(formData.get("features_json") ?? "[]"));
    await updatePlan(id, {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      price_cents: Number(formData.get("price_cents") ?? 0),
      description: String(formData.get("description") ?? ""),
      trial_days: formData.get("trial_enabled") === "on" ? Number(formData.get("trial_days") ?? 0) : 0,
      stripe_price_id: String(formData.get("stripe_price_id") ?? "") || null,
      hierarchy_level: Number(formData.get("hierarchy_level") ?? 0),
      status: String(formData.get("status") ?? "active") as "active" | "inactive",
      features,
    });
    revalidatePath("/admin/planos"); revalidatePath("/assinar"); revalidatePath("/");
  }

  return <section className="space-y-6"><PageHeader title="Central de Planos" description="Edição completa dos planos usados pela Home e Assinatura." />
    <div className="grid gap-4 lg:grid-cols-3">{plans.map((plan)=><form key={plan.id} action={savePlan} className="rounded-xl border border-border bg-surface p-5 shadow-premium space-y-3"><input type="hidden" name="id" value={plan.id} />
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">{plan.name}</h3><span className="text-xs text-muted">{plan.slug}</span></div>
      <input name="name" defaultValue={plan.name} className="w-full rounded border border-border bg-background px-3 py-2" />
      <input name="slug" defaultValue={plan.slug} className="w-full rounded border border-border bg-background px-3 py-2" />
      <input name="price_cents" type="number" defaultValue={plan.price_cents} className="w-full rounded border border-border bg-background px-3 py-2" />
      <input name="description" defaultValue={plan.description ?? ""} className="w-full rounded border border-border bg-background px-3 py-2" />
      <label className="text-xs flex items-center gap-2"><input type="checkbox" name="trial_enabled" defaultChecked={plan.trial_days > 0} /> Trial ativo</label>
      <input name="trial_days" type="number" defaultValue={plan.trial_days} className="w-full rounded border border-border bg-background px-3 py-2" />
      <input name="stripe_price_id" defaultValue={plan.stripe_price_id ?? ""} className="w-full rounded border border-border bg-background px-3 py-2" placeholder="Stripe Price ID" />
      {["plus","premium"].includes(plan.slug) && !plan.stripe_price_id ? <p className="text-xs text-amber-300">Plano pago sem Stripe Price ID.</p> : null}
      <input name="hierarchy_level" type="number" defaultValue={plan.hierarchy_level} className="w-full rounded border border-border bg-background px-3 py-2" />
      <select name="status" defaultValue={plan.status} className="w-full rounded border border-border bg-background px-3 py-2"><option value="active">active</option><option value="inactive">inactive</option></select>
      <textarea name="features_json" rows={4} defaultValue={JSON.stringify(plan.features ?? [], null, 2)} className="w-full rounded border border-border bg-background px-3 py-2" />
      <input name="button_text" defaultValue="Assinar" className="w-full rounded border border-border bg-background px-3 py-2" />
      <input name="ribbon" defaultValue="" className="w-full rounded border border-border bg-background px-3 py-2" placeholder="Destaque/ribbon" />
      <button className="w-full rounded bg-gold-500/20 px-3 py-2 text-gold-300">Salvar plano</button>
    </form>)}</div></section>;
}
