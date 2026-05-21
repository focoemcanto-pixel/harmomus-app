import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];

export interface MemberListItem {
  profile: Profile;
  subscription: Subscription | null;
  plan: Database["public"]["Tables"]["plans"]["Row"] | null;
}

export async function getMembers(filters?: { query?: string; planId?: string; status?: string }): Promise<MemberListItem[]> {
  const supabase = (await createClient()) as any;
  let profileQuery = supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (filters?.query?.trim()) {
    profileQuery = profileQuery.or(`full_name.ilike.%${filters.query}%,email.ilike.%${filters.query}%`);
  }
  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) throw new Error(`Falha ao listar membros: ${profileError.message}`);

  const ids = (profiles ?? []).map((p: any) => p.id);
  const [{ data: subscriptions, error: subscriptionError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.from("subscriptions").select("*").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("plans").select("*"),
  ]);
  if (subscriptionError) throw new Error(`Falha ao carregar assinaturas: ${subscriptionError.message}`);
  if (plansError) throw new Error(`Falha ao carregar planos: ${plansError.message}`);

  const latestSubByUser = new Map<string, any>();
  for (const sub of subscriptions ?? []) {
    const current = latestSubByUser.get(sub.user_id);
    if (!current || new Date(sub.created_at) > new Date(current.created_at)) latestSubByUser.set(sub.user_id, sub);
  }
  const planMap = new Map((plans ?? []).map((plan: any) => [plan.id, plan]));

  return (profiles ?? [])
    .map((profile: any) => {
      const subscription = latestSubByUser.get(profile.id) ?? null;
      const plan = subscription ? planMap.get(subscription.plan_id) ?? null : null;
      return { profile, subscription, plan };
    })
    .filter((member: MemberListItem) => (filters?.planId ? member.plan?.id === filters.planId : true))
    .filter((member: MemberListItem) => (filters?.status ? member.subscription?.status === filters.status : true));
}

export async function getMemberById(id: string): Promise<MemberListItem | null> {
  const supabase = (await createClient()) as any;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (profileError) throw new Error(`Falha ao buscar perfil: ${profileError.message}`);
  if (!profile) return null;

  const [{ data: subscription }, { data: plans }] = await Promise.all([
    supabase.from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("plans").select("*"),
  ]);
  const plan = subscription ? (plans ?? []).find((item: any) => item.id === subscription.plan_id) ?? null : null;

  return { profile, subscription: subscription ?? null, plan };
}

export async function updateMemberSubscription(userId: string, payload: Database["public"]["Tables"]["subscriptions"]["Update"]): Promise<void> {
  const supabase = (await createClient()) as any;
  const { error } = await supabase.from("subscriptions").update({ ...payload, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
}

export async function cancelMemberSubscription(userId: string): Promise<void> {
  await updateMemberSubscription(userId, { status: "canceled", auto_renew: false });
}

export async function reactivateMemberSubscription(userId: string): Promise<void> {
  await updateMemberSubscription(userId, { status: "active", auto_renew: true });
}
