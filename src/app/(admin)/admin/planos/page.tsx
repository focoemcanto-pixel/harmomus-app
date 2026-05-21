import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/admin/page-header";
import { createPlan, getPlans, togglePlanStatus } from "@/lib/data/plans";

export default async function AdminPlanosPage() {
  const plans = await getPlans();

  async function savePlan(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    if (!name || !slug) throw new Error("Nome e slug são obrigatórios.");

    const featuresRaw = String(formData.get("features") ?? "[]");
    const features = JSON.parse(featuresRaw);

    await createPlan({
      name,
      slug,
      description: String(formData.get("description") ?? "").trim(),
      price_cents: Number(formData.get("price_cents") ?? 0),
      currency: "BRL",
      trial_days: Number(formData.get("trial_days") ?? 0),
      hierarchy_level: Number(formData.get("hierarchy_level") ?? 0),
      status: String(formData.get("status") ?? "active") as "active" | "inactive",
      features,
    });
    revalidatePath("/admin/planos");
  }

  async function flipStatus(formData: FormData) {
    "use server";
    const id = String(formData.get("id"));
    const status = String(formData.get("status")) as "active" | "inactive";
    await togglePlanStatus(id, status === "active" ? "inactive" : "active");
    revalidatePath("/admin/planos");
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Central de Planos" description="Planos, hierarquia e benefícios premium com base segura para futura integração de gateways." />
      <div className="rounded-xl border border-border bg-surface p-6 shadow-premium">
        <form action={savePlan} className="grid gap-3 md:grid-cols-4">
          <input name="name" placeholder="Nome" className="rounded-lg border border-border bg-background px-3 py-2" required />
          <input name="slug" placeholder="Slug" className="rounded-lg border border-border bg-background px-3 py-2" required />
          <input name="price_cents" type="number" placeholder="Preço em centavos" className="rounded-lg border border-border bg-background px-3 py-2" required />
          <input name="trial_days" type="number" placeholder="Trial (dias)" className="rounded-lg border border-border bg-background px-3 py-2" />
          <input name="hierarchy_level" type="number" placeholder="Nível hierárquico" className="rounded-lg border border-border bg-background px-3 py-2" required />
          <input name="description" placeholder="Descrição" className="rounded-lg border border-border bg-background px-3 py-2 md:col-span-2" />
          <input name="features" placeholder='Features JSON (ex: ["suporte"])' className="rounded-lg border border-border bg-background px-3 py-2" defaultValue='[]' />
          <select name="status" className="rounded-lg border border-border bg-background px-3 py-2">
            <option value="active">Ativo</option><option value="inactive">Inativo</option>
          </select>
          <button className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-gold-300">Criar plano</button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-premium overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-muted"><tr><th className="p-4">Plano</th><th>Preço</th><th>Nível</th><th>Trial</th><th>Status</th><th>Recursos</th><th></th></tr></thead>
          <tbody>
            {plans.map((plan) => (
              <tr key={plan.id} className="border-t border-border/70">
                <td className="p-4"><p className="font-medium">{plan.name}</p><p className="text-xs text-muted">{plan.slug}</p></td>
                <td>R$ {(plan.price_cents / 100).toFixed(2)}</td>
                <td>{plan.hierarchy_level}</td>
                <td>{plan.trial_days} dias</td>
                <td><span className={`rounded-full px-3 py-1 text-xs ${plan.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/30 text-zinc-300"}`}>{plan.status}</span></td>
                <td className="max-w-sm truncate">{JSON.stringify(plan.features)}</td>
                <td>
                  <form action={flipStatus}>
                    <input type="hidden" name="id" value={plan.id} />
                    <input type="hidden" name="status" value={plan.status} />
                    <button className="rounded-lg border border-border px-3 py-1.5">{plan.status === "active" ? "Desativar" : "Ativar"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
