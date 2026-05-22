import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/admin/page-header";
import { cancelMemberSubscription, getMemberById, reactivateMemberSubscription, updateMemberSubscription } from "@/lib/data/members";
import { getPlans } from "@/lib/data/plans";
import { createClient } from "@/lib/supabase/server";

const STATUS_OPTIONS = ["active", "trialing", "pending", "canceled", "inactive"] as const;

type UiWarnings = {
  member?: string;
  billing?: string;
  subscription?: string;
  history?: string;
  stripe?: string;
};

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const warnings: UiWarnings = {};

  const [memberResult, plansResult] = await Promise.allSettled([getMemberById(id), getPlans()]);

  let member = null as Awaited<ReturnType<typeof getMemberById>>;
  if (memberResult.status === "fulfilled") {
    member = memberResult.value;
  } else {
    warnings.member = "Não foi possível carregar os dados do membro agora.";
  }

  const plans = plansResult.status === "fulfilled" ? plansResult.value : [];
  if (plansResult.status === "rejected") {
    warnings.subscription = "Não foi possível carregar os planos para edição.";
  }

  const supabase = (await createClient()) as any;

  let billingProfile: any = null;
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, gateway_customer_id, gateway, stripe_subscription_id")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    billingProfile = data ?? null;
  } catch {
    warnings.billing = "Não foi possível carregar billing profile.";
  }

  let subscriptionRecord: any = member?.subscription ?? null;
  try {
    if (!subscriptionRecord) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      subscriptionRecord = data ?? null;
    }
  } catch {
    warnings.subscription = "Não foi possível carregar a assinatura.";
    subscriptionRecord = null;
  }

  let subscriptionHistoryLabel = "Sem histórico disponível.";
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("updated_at")
      .eq("user_id", id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data?.updated_at) {
      subscriptionHistoryLabel = `Última atualização em ${new Date(data.updated_at).toLocaleString("pt-BR")}.`;
    }
  } catch {
    warnings.history = "Não foi possível carregar o histórico de assinatura.";
  }

  const stripeCustomerId = billingProfile?.stripe_customer_id ?? subscriptionRecord?.stripe_customer_id ?? null;
  const stripeSubscriptionId = billingProfile?.stripe_subscription_id ?? subscriptionRecord?.stripe_subscription_id ?? null;
  if (!stripeCustomerId && !stripeSubscriptionId) {
    warnings.stripe = "Dados do Stripe indisponíveis para este membro.";
  }

  const profile = member?.profile;
  const planId = subscriptionRecord?.plan_id ?? "";
  const status = subscriptionRecord?.status ?? "inactive";

  async function save(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id"));
    await updateMemberSubscription(userId, { plan_id: String(formData.get("plan_id")), status: String(formData.get("status")) as any });
    revalidatePath(`/admin/membros/${userId}`);
    revalidatePath("/admin/membros");
  }
  async function cancel(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id"));
    await cancelMemberSubscription(userId);
    revalidatePath(`/admin/membros/${userId}`);
  }
  async function reactivate(formData: FormData) {
    "use server";
    const userId = String(formData.get("user_id"));
    await reactivateMemberSubscription(userId);
    revalidatePath(`/admin/membros/${userId}`);
  }

  return <section className="space-y-6"><PageHeader title="Detalhe do Membro" description="Gerencie plano, status e ações administrativas." />
    {Object.values(warnings).filter(Boolean).length ? <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200 space-y-1">
      {Object.values(warnings).filter(Boolean).map((warning)=><p key={warning}>{warning}</p>)}
    </div> : null}
    <div className="grid gap-4 md:grid-cols-2"><div className="rounded-xl border border-border bg-surface p-6 shadow-premium space-y-2">
      <p><strong>Nome:</strong> {profile?.full_name ?? "-"}</p><p><strong>Email:</strong> {profile?.email ?? "-"}</p><p><strong>Username:</strong> {profile?.legacy_pms_member_id ?? "-"}</p><p><strong>Telefone:</strong> -</p><p><strong>Avatar:</strong> {profile?.avatar_url ?? "-"}</p><p><strong>Cadastro:</strong> {profile?.created_at ? new Date(profile.created_at).toLocaleString("pt-BR") : "-"}</p>
      <p><strong>Plano atual:</strong> {member?.plan?.name ?? "Free"}</p><p><strong>Status:</strong> {status}</p><p><strong>Stripe customer:</strong> {stripeCustomerId ?? "null"}</p><p><strong>Subscription:</strong> {stripeSubscriptionId ?? "null"}</p>
    </div>
      <form action={save} className="rounded-xl border border-border bg-surface p-6 shadow-premium space-y-3"><input type="hidden" name="user_id" value={profile?.id ?? id} />
        <label className="block text-sm">Plano<select name="plan_id" defaultValue={planId} className="mt-1 w-full rounded border border-border bg-background px-3 py-2"><option value="">Free</option>{plans.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="block text-sm">Status<select name="status" defaultValue={status} className="mt-1 w-full rounded border border-border bg-background px-3 py-2">{STATUS_OPTIONS.map((s)=><option key={s}>{s}</option>)}</select></label>
        {!subscriptionRecord ? <div className="rounded border border-blue-500/40 bg-blue-500/10 p-3 text-sm text-blue-200">Usuário sem assinatura ativa</div> : null}
        <button className="rounded bg-gold-500/20 px-4 py-2 text-gold-300">Salvar promoção/downgrade</button>
        <div className="flex gap-2"><button formAction={cancel} onClick={(e)=>{ if(!confirm('Confirmar cancelamento?')) e.preventDefault(); }} className="rounded border border-red-500/50 px-3 py-2 text-red-300">Cancelar</button>
          <button formAction={reactivate} onClick={(e)=>{ if(!confirm('Confirmar reativação?')) e.preventDefault(); }} className="rounded border border-emerald-500/50 px-3 py-2 text-emerald-300">Reativar</button></div>
        <div className="text-xs text-muted rounded border border-border bg-background p-3">Histórico: {subscriptionHistoryLabel}</div>
      </form></div></section>;
}
