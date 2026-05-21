import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { cancelMemberSubscription, getMemberById, reactivateMemberSubscription, updateMemberSubscription } from "@/lib/data/members";
import { getPlans } from "@/lib/data/plans";

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [member, plans] = await Promise.all([getMemberById(id), getPlans()]);
  if (!member) notFound();

  async function promoteOrDowngrade(formData: FormData) { "use server";
    const userId = String(formData.get("user_id"));
    const planId = String(formData.get("plan_id"));
    await updateMemberSubscription(userId, { plan_id: planId });
    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }
  async function cancel(formData: FormData) { "use server"; const userId = String(formData.get("user_id")); await cancelMemberSubscription(userId); revalidatePath(`/admin/membros/${userId}`); }
  async function reactivate(formData: FormData) { "use server"; const userId = String(formData.get("user_id")); await reactivateMemberSubscription(userId); revalidatePath(`/admin/membros/${userId}`); }

  return <section className="space-y-6"><PageHeader title="Detalhe do Membro" description="Gestão de assinatura, upgrades e histórico básico." />
    <div className="rounded-xl border border-border bg-surface p-6 shadow-premium space-y-2"><h3 className="text-lg font-semibold">{member.profile.full_name ?? "Sem nome"}</h3><p className="text-muted">{member.profile.email ?? "Sem e-mail"}</p><p className="text-xs text-muted">Role: {member.profile.role}</p></div>
    <div className="rounded-xl border border-border bg-surface p-6 shadow-premium space-y-4"><p>Plano atual: <strong>{member.plan?.name ?? "Sem plano"}</strong></p><p>Status: <strong>{member.subscription?.status ?? "none"}</strong></p><form action={promoteOrDowngrade} className="flex gap-3"><input type="hidden" name="user_id" value={member.profile.id} /><select name="plan_id" className="rounded-lg border border-border bg-background px-3 py-2">{plans.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-gold-300">Promover / Downgrade</button></form>
      <div className="flex gap-3"><form action={cancel}><input type="hidden" name="user_id" value={member.profile.id} /><button className="rounded-lg border border-red-500/50 px-4 py-2 text-red-300">Cancelar assinatura</button></form><form action={reactivate}><input type="hidden" name="user_id" value={member.profile.id} /><button className="rounded-lg border border-emerald-500/50 px-4 py-2 text-emerald-300">Reativar</button></form></div>
      <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted">Histórico básico: {member.subscription ? `Assinatura ${member.subscription.status} em ${new Date(member.subscription.updated_at).toLocaleString("pt-BR")}` : "Sem eventos."}</div>
      <p className="text-xs text-muted">TODO: Integrar Stripe, Asaas e Mercado Pago com trilha completa de eventos.</p>
    </div></section>;
}
