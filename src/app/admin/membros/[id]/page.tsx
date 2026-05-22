import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { cancelMemberSubscription, getMemberById, reactivateMemberSubscription, updateMemberSubscription } from "@/lib/data/members";
import { getPlans } from "@/lib/data/plans";

const STATUS_OPTIONS = ["active", "trialing", "pending", "canceled", "inactive"] as const;

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [member, plans] = await Promise.all([getMemberById(id), getPlans()]);
  if (!member) notFound();

  async function save(formData: FormData) { "use server";
    const userId = String(formData.get("user_id"));
    await updateMemberSubscription(userId, { plan_id: String(formData.get("plan_id")), status: String(formData.get("status")) as any });
    revalidatePath(`/admin/membros/${userId}`); revalidatePath("/admin/membros");
  }
  async function cancel(formData: FormData) { "use server"; const userId = String(formData.get("user_id")); await cancelMemberSubscription(userId); revalidatePath(`/admin/membros/${userId}`); }
  async function reactivate(formData: FormData) { "use server"; const userId = String(formData.get("user_id")); await reactivateMemberSubscription(userId); revalidatePath(`/admin/membros/${userId}`); }

  return <section className="space-y-6"><PageHeader title="Detalhe do Membro" description="Gerencie plano, status e ações administrativas." />
  <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-border bg-surface p-6 shadow-premium space-y-2">
    <p><strong>Nome:</strong> {member.profile.full_name ?? "-"}</p><p><strong>Email:</strong> {member.profile.email ?? "-"}</p><p><strong>Username:</strong> {member.profile.legacy_pms_member_id ?? "-"}</p><p><strong>Telefone:</strong> -</p><p><strong>Avatar:</strong> {member.profile.avatar_url ?? "-"}</p><p><strong>Cadastro:</strong> {new Date(member.profile.created_at).toLocaleString("pt-BR")}</p>
  </div>
  <form action={save} className="rounded-xl border border-border bg-surface p-6 shadow-premium space-y-3"><input type="hidden" name="user_id" value={member.profile.id} />
    <label className="block text-sm">Plano<select name="plan_id" defaultValue={member.subscription?.plan_id ?? ""} className="mt-1 w-full rounded border border-border bg-background px-3 py-2">{plans.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="block text-sm">Status<select name="status" defaultValue={member.subscription?.status ?? "pending"} className="mt-1 w-full rounded border border-border bg-background px-3 py-2">{STATUS_OPTIONS.map((s)=><option key={s}>{s}</option>)}</select></label>
    <button className="rounded bg-gold-500/20 px-4 py-2 text-gold-300">Salvar promoção/downgrade</button>
    <div className="flex gap-2"><button formAction={cancel} onClick={(e)=>{ if(!confirm('Confirmar cancelamento?')) e.preventDefault(); }} className="rounded border border-red-500/50 px-3 py-2 text-red-300">Cancelar</button>
    <button formAction={reactivate} onClick={(e)=>{ if(!confirm('Confirmar reativação?')) e.preventDefault(); }} className="rounded border border-emerald-500/50 px-3 py-2 text-emerald-300">Reativar</button></div>
    <div className="text-xs text-muted rounded border border-border bg-background p-3">Histórico: Última atualização em {member.subscription ? new Date(member.subscription.updated_at).toLocaleString("pt-BR") : "sem assinatura"}.</div>
  </form></div></section>;
}
