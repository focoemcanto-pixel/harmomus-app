import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];

export interface MemberListItem {
  profile: Profile;
  subscription: Subscription | null;
  plan: Plan | null;
}

function makeProfileFromAuthUser(user: any, profile?: any): Profile {
  const metadata = user.user_metadata ?? {};
  return {
    id: user.id,
    email: profile?.email ?? user.email ?? null,
    full_name: profile?.full_name ?? metadata.full_name ?? metadata.name ?? metadata.username ?? null,
    avatar_url: profile?.avatar_url ?? metadata.avatar_url ?? null,
    role: profile?.role ?? metadata.role ?? "user",
    created_at: profile?.created_at ?? user.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at ?? new Date().toISOString(),
  } as Profile;
}

async function listAllAuthUsers(supabase: any) {
  const allUsers: any[] = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Falha ao listar usuários Auth: ${error.message}`);

    const users = data?.users ?? [];
    allUsers.push(...users);

    if (users.length < perPage) break;
    page += 1;
  }

  return allUsers;
}

async function syncMissingProfiles(supabase: any, authUsers: any[], existingProfiles: any[]) {
  const existingIds = new Set((existingProfiles ?? []).map((profile: any) => profile.id));
  const missingProfiles = authUsers
    .filter((user: any) => user.id && !existingIds.has(user.id))
    .map((user: any) => {
      const metadata = user.user_metadata ?? {};
      return {
        id: user.id,
        email: user.email ?? null,
        full_name: metadata.full_name ?? metadata.name ?? metadata.username ?? null,
        role: metadata.role ?? "user",
        updated_at: new Date().toISOString(),
      };
    });

  if (!missingProfiles.length) return existingProfiles ?? [];

  const { error } = await supabase.from("profiles").upsert(missingProfiles, { onConflict: "id" });
  if (error) {
    return existingProfiles ?? [];
  }

  const { data: refreshedProfiles, error: refreshError } = await supabase.from("profiles").select("*");
  if (refreshError) return existingProfiles ?? [];
  return refreshedProfiles ?? [];
}

export async function getMembers(filters?: { query?: string; planId?: string; status?: string }): Promise<MemberListItem[]> {
  const supabase = createSupabaseAdminClient() as any;

  const [authUsers, { data: initialProfiles, error: profileError }, { data: plans, error: plansError }] = await Promise.all([
    listAllAuthUsers(supabase),
    supabase.from("profiles").select("*"),
    supabase.from("plans").select("*"),
  ]);

  if (profileError) throw new Error(`Falha ao listar perfis: ${profileError.message}`);
  if (plansError) throw new Error(`Falha ao carregar planos: ${plansError.message}`);

  const profiles = await syncMissingProfiles(supabase, authUsers, initialProfiles ?? []);
  const profileMap = new Map<string, Profile>((profiles ?? []).map((profile: any) => [profile.id, profile as Profile]));
  const seenIds = new Set<string>();
  const mergedProfiles: Profile[] = [
    ...authUsers.map((user: any) => makeProfileFromAuthUser(user, profileMap.get(user.id))),
    ...(profiles ?? []).filter((profile: any) => !authUsers.some((user: any) => user.id === profile.id)),
  ].filter((profile: any) => {
    if (!profile?.id || seenIds.has(profile.id)) return false;
    seenIds.add(profile.id);
    return true;
  }) as Profile[];

  const ids = mergedProfiles.map((p) => p.id).filter(Boolean);
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("*")
    .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  if (subscriptionError) throw new Error(`Falha ao carregar assinaturas: ${subscriptionError.message}`);

  const latestSubByUser = new Map<string, Subscription>();
  for (const sub of subscriptions ?? []) {
    const current = latestSubByUser.get(sub.user_id);
    if (!current || new Date(sub.created_at) > new Date(current.created_at)) latestSubByUser.set(sub.user_id, sub as Subscription);
  }
  const planMap = new Map<string, Plan>((plans ?? []).map((plan: any) => [plan.id, plan as Plan]));

  const query = filters?.query?.trim().toLowerCase() ?? "";

  return mergedProfiles
    .map((profile): MemberListItem => {
      const subscription = latestSubByUser.get(profile.id) ?? null;
      const plan = subscription ? planMap.get(subscription.plan_id) ?? null : null;
      return { profile, subscription, plan };
    })
    .filter((member) => {
      if (!query) return true;
      return `${member.profile.full_name ?? ""} ${member.profile.email ?? ""}`.toLowerCase().includes(query);
    })
    .filter((member) => (filters?.planId ? member.plan?.id === filters.planId : true))
    .filter((member) => (filters?.status ? member.subscription?.status === filters.status : true))
    .sort((a, b) => new Date(b.profile.created_at ?? 0).getTime() - new Date(a.profile.created_at ?? 0).getTime());
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

  const mergedProfile = authUser ? makeProfileFromAuthUser(authUser, profile) : (profile as Profile);
  const plan = subscription ? ((plans ?? []) as Plan[]).find((item) => item.id === subscription.plan_id) ?? null : null;

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
