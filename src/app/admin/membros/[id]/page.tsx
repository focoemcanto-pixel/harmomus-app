import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { cancelMemberSubscription, deleteMember, getMemberById, reactivateMemberSubscription, updateMemberSubscription } from "@/lib/data/members";
import { getPlans } from "@/lib/data/plans";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_OPTIONS = ["active", "trialing", "pending", "canceled", "inactive"] as const;

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

function getMetadataValue(profile: any, key: string) {
  return profile?.user_metadata?.[key] ?? profile?.raw_user_meta_data?.[key] ?? null;
}

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [memberResult, plansResult] = await Promise.allSettled([getMemberById(id), getPlans()]);
  const member = memberResult.status === "fulfilled" ? memberResult.value : null;
  const plans = plansResult.status === "fulfilled" ? plansResult.value : [];

  const profile: any = member?.profile ?? null;
  const subscription: any = member?.subscription ?? null;
  const currentPlanId = subscription?.plan_id ?? "";
  const currentStatus = subscription?.status ?? "inactive";
  const username = getMetadataValue(profile, "username") ?? "-";
  const phone = getMetadataValue(profile, "phone") ?? "-";

  async function save(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");
    const planId = String(formData.get("plan_id") ?? "");
    const status = String(formData.get("status") ?? "inactive") as any;
    await updateMemberSubscription(userId, { plan_id: planId || undefined, status });
    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }

  async function cancel(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");
    await cancelMemberSubscription(userId);
    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }

  async function reactivate(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");
    await reactivateMemberSubscription(userId);
    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }

  async function remove(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id") ?? "");
    await deleteMember(userId);
    revalidatePath("/admin/membros");
    redirect("/admin/membros");
  }

  if (!member || !profile) {
    return (
      <section className="space-y-6">
        <PageHeader title="Membro não encontrado" description="Não foi possível carregar este membro." />
        <a href="/admin/membros" className="inline-flex rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-white">Voltar para membros</a>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader title="Detalhe do Membro" description="Gerencie plano, status, assinatura e ações administrativas." />

      <div className="rounded-2xl border border-border bg-surface p-6 shadow-premium">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold-300">Membro</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{profile.full_name ?? "Sem nome"}</h2>
            <p className="text-sm text-muted">{profile.email ?? "Sem e-mail"}</p>
          </div>
          <a href="/admin/membros" className="rounded-xl border border-border px-4 py-2 text-sm text-muted hover:text-white">Voltar</a>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-premium">
          <h3 className="text-lg font-semibold text-white">Dados do perfil</h3>
          <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-2">
            <p><strong className="text-white">Nome:</strong> {profile.full_name ?? "-"}</p>
            <p><strong className="text-white">E-mail:</strong> {profile.email ?? "-"}</p>
            <p><strong className="text-white">Username:</strong> {username}</p>
            <p><strong className="text-white">Telefone:</strong> {phone}</p>
            <p><strong className="text-white">Cadastro:</strong> {formatDate(profile.created_at)}</p>
            <p><strong className="text-white">Atualizado:</strong> {formatDate(profile.updated_at)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-premium">
          <h3 className="text-lg font-semibold text-white">Assinatura</h3>
          <div className="mt-4 grid gap-3 text-sm text-muted md:grid-cols-2">
            <p><strong className="text-white">Plano atual:</strong> {member.plan?.name ?? "Free"}</p>
            <p><strong className="text-white">Status:</strong> {currentStatus}</p>
            <p><strong className="text-white">Gateway:</strong> {subscription?.gateway ?? "-"}</p>
            <p><strong className="text-white">Stripe Customer:</strong> {subscription?.stripe_customer_id ?? "-"}</p>
            <p><strong className="text-white">Stripe Sub:</strong> {subscription?.stripe_subscription_id ?? "-"}</p>
            <p><strong className="text-white">Próx. cobrança:</strong> {formatDate(subscription?.next_billing_at ?? subscription?.current_period_end)}</p>
          </div>
        </div>
      </div>

      <form action={save} className="rounded-2xl border border-border bg-surface p-6 shadow-premium">
        <input type="hidden" name="user_id" value={profile.id ?? id} />
        <h3 className="text-lg font-semibold text-white">Alterar plano/status</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-muted">Plano
            <select name="plan_id" defaultValue={currentPlanId} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-white">
              <option value="">Free</option>
              {plans.map((plan: any) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Status
            <select name="status" defaultValue={currentStatus} className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-white">
              {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="rounded-xl bg-gold-500/20 px-5 py-3 text-sm font-semibold text-gold-300 hover:bg-gold-500/30">Salvar alteração</button>
          <button formAction={cancel} className="rounded-xl border border-red-500/50 px-5 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/10">Cancelar assinatura</button>
          <button formAction={reactivate} className="rounded-xl border border-emerald-500/50 px-5 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/10">Reativar assinatura</button>
        </div>
      </form>

      <form action={remove} className="rounded-2xl border border-red-500/40 bg-red-500/5 p-6 shadow-premium">
        <input type="hidden" name="user_id" value={profile.id ?? id} />
        <h3 className="text-lg font-semibold text-red-200">Excluir membro</h3>
        <p className="mt-2 text-sm text-red-100/80">Remove o usuário do Auth, perfil, assinatura e playlists vinculadas. Use apenas para cadastros de teste ou duplicados.</p>
        <button className="mt-4 rounded-xl border border-red-400/70 px-5 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/10">Excluir definitivamente</button>
      </form>
    </section>
  );
}
