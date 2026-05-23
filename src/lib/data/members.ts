import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];

export interface MemberListItem {
  profile: Profile;
  subscription: Subscription | null;
  plan: Database["public"]["Tables"]["plans"]["Row"] | null;
}

function makeProfileFromAuthUser(user: any, profile?: any): Profile {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? null,
    full_name: profile?.full_name ?? metadata.full_name ?? metadata.name ?? null,
    avatar_url: profile?.avatar_url ?? metadata.avatar_url ?? null,
    role: profile?.role ?? metadata.role ?? "user",
    created_at: profile?.created_at ?? user.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at ?? new Date().toISOString(),
  } as Profile;
}

export async function getMembers(filters?: { query?: string; planId?: string; status?: string }): Promise<MemberListItem[]> {
  const supabase = createSupabaseAdminClient() as any;

  const [{ data: authUsersPage, error: authError }, { data: profiles, error: profileError }, { data: plans, error: plansError }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("profiles").select("*"),
    supabase.from("plans").select("*"),
  ]);

  if (authError) throw new Error(`Falha ao listar usuários Auth: ${authError.message}`);
  if (profileError) throw new Error(`Falha ao listar perfis: ${profileError.message}`);
  if (plansError) throw new Error(`Falha ao carregar planos: ${plansError.message}`);

  const authUsers = authUsersPage?.users ?? [];
  const profileMap = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  const profileOnlyUsers = (profiles ?? []).filter((profile: any) => !authUsers.some((user: any) => user.id === profile.id));
  const mergedProfiles = [
    ...authUsers.map((user: any) => makeProfileFromAuthUser(user, profileMap.get(user.id))),
    ...profileOnlyUsers,
  ];

  const ids = mergedProfiles.map((p: any) => p.id).filter(Boolean);
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("*")
    .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  if (subscriptionError) throw new Error(`Falha ao carregar assinaturas: ${subscriptionError.message}`);

  const latestSubByUser = new Map<string, any>();
  for (const sub of subscriptions ?? []) {
    const current = latestSubByUser.get(sub.user_id);
    if (!current || new Date(sub.created_at) > new Date(current.created_at)) latestSubByUser.set(sub.user_id, sub);
  }
  const planMap = new Map((plans ?? []).map((plan: any) => [plan.id, plan]));

  const query = filters?.query?.trim().toLowerCase() ?? "";

  return mergedProfiles
    .map((profile: any) => {
      const subscription = latestSubByUser.get(profile.id) ?? null;
      const plan = subscription ? planMap.get(subscription.plan_id) ?? null : null;
      return { profile, subscription, plan };
    })
    .filter((member: MemberListItem) => {
      if (!query) return true;
      return `${member.profile.full_name ?? ""} ${member.profile.email ?? ""}`.toLowerCase().includes(query);
    })
    .filter((member: MemberListItem) => (filters?.planId ? member.plan?.id === filters.planId : true))
    .filter((member: MemberListItem) => (filters?.status ? member.subscription?.status === filters.status : true))
    .sort((a: MemberListItem, b: MemberListItem) => new Date(b.profile.created_at ?? 0).getTime() - new Date(a.profile.created_at ?? 0).getTime());
}

export async function getMemberById(id: string): Promise<MemberListItem | null> {
  const supabase = createSupabaseAdminClient() as any;
  const [{ data: profile }, authResult, { data: subscription }, { data: plans }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.auth.admin.getUserById(id),
    supabase.from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("plans").select("*"),
  ]);

  const authUser = authResult?.data?.user ?? null;
  if (!profile && !authUser) return null;

  const mergedProfile = authUser ? makeProfileFromAuthUser(authUser, profile) : profile;
  const plan = subscription ? (plans ?? []).find((item: any) => item.id === subscription.plan_id) ?? null : null;

  return { profile: mergedProfile, subscription: subscription ?? null, plan };
}

export async function updateMemberSubscription(userId: string, payload: Database["public"]["Tables"]["subscriptions"]["Update"]): Promise<void> {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("subscriptions").update({ ...payload, updated_at: new Date().toISOString() }).eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
}

export async function cancelMemberSubscription(userId: string): Promise<void> {
  await updateMemberSubscription(userId, { status: "canceled", auto_renew: false });
}

export async function reactivateMemberSubscription(userId: string): Promise<void> {
  await updateMemberSubscription(userId, { status: "active", auto_renew: true });
}
