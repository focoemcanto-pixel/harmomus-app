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

export interface SubscriberJourneyData {
  communicationLogs: any[];
  webhookLogs: any[];
  webhookProcessedEvents: any[];
  kitAccessLogs: any[];
  audioAccessLogs: any[];
  legacyPmsSubscriptions: any[];
  legacyStripeCustomers: any[];
  legacyStripeCustomerImports: any[];
}

function makeProfileFromAuthUser(user: any, profile?: any): Profile {
  const metadata = user?.user_metadata ?? {};
  return {
    ...(profile ?? {}),
    id: profile?.id ?? user.id,
    email: profile?.email ?? user.email ?? null,
    auth_email: user.email ?? null,
    full_name: profile?.full_name ?? metadata.full_name ?? metadata.name ?? metadata.username ?? null,
    avatar_url: profile?.avatar_url ?? metadata.avatar_url ?? null,
    role: profile?.role ?? metadata.role ?? "user",
    created_at: profile?.created_at ?? user.created_at ?? new Date().toISOString(),
    updated_at: profile?.updated_at ?? user.updated_at ?? user.created_at ?? new Date().toISOString(),
    auth_created_at: user.created_at ?? null,
    auth_updated_at: user.updated_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    confirmed_at: user.confirmed_at ?? null,
    user_metadata: metadata,
    raw_user_meta_data: user.raw_user_meta_data ?? metadata,
    app_metadata: user.app_metadata ?? null,
  } as unknown as Profile;
}

async function listAllAuthUsers(supabase: any) {
  const allUsers: any[] = [];
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    try {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
      if (error) break;
      const users = data?.users ?? [];
      allUsers.push(...users);
      if (users.length < perPage) break;
    } catch {
      break;
    }
  }

  return allUsers;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function loadSubscriptionsByUserIds(supabase: any, userIds: string[]) {
  if (!userIds.length) return [] as Subscription[];

  const results = await Promise.all(
    chunk(userIds, 200).map(async (ids) => {
      try {
        const { data, error } = await supabase.from("subscriptions").select("*").in("user_id", ids);
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    }),
  );

  return results.flat() as Subscription[];
}

export async function getMembers(filters?: { query?: string; planId?: string; status?: string }): Promise<MemberListItem[]> {
  const supabase = createSupabaseAdminClient() as any;

  const [authUsers, profilesResult, plansResult] = await Promise.all([
    listAllAuthUsers(supabase),
    supabase.from("profiles").select("*"),
    supabase.from("plans").select("*"),
  ]);

  const initialProfiles = profilesResult.data ?? [];
  const plans = plansResult.data ?? [];

  if (profilesResult.error && !authUsers.length) {
    throw new Error(`Falha ao listar membros: ${profilesResult.error.message}`);
  }

  const profileMap = new Map<string, Profile>(initialProfiles.map((profile: any) => [String(profile.id), profile as Profile]));
  const authIds = new Set(authUsers.map((user: any) => String(user.id)));
  const seenIds = new Set<string>();

  const mergedProfiles: Profile[] = [
    ...authUsers.map((user: any) => makeProfileFromAuthUser(user, profileMap.get(String(user.id)))),
    ...initialProfiles.filter((profile: any) => !authIds.has(String(profile.id))),
  ].filter((profile: any) => {
    const id = String(profile?.id ?? "");
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  }) as Profile[];

  const ids = mergedProfiles.map((profile) => String(profile.id)).filter(Boolean);
  const subscriptions = await loadSubscriptionsByUserIds(supabase, ids);

  const latestSubByUser = new Map<string, Subscription>();
  for (const sub of subscriptions) {
    const current = latestSubByUser.get(sub.user_id);
    if (!current || new Date(sub.created_at).getTime() > new Date(current.created_at).getTime()) {
      latestSubByUser.set(sub.user_id, sub);
    }
  }

  const typedPlans = plans as Plan[];
  const planMap = new Map<string, Plan>(typedPlans.map((plan) => [plan.id, plan]));
  const query = filters?.query?.trim().toLowerCase() ?? "";

  return mergedProfiles
    .map((profile): MemberListItem => {
      const subscription = latestSubByUser.get(profile.id) ?? null;
      const plan = subscription?.plan_id ? planMap.get(subscription.plan_id) ?? null : null;
      return { profile, subscription, plan };
    })
    .filter((member) => !query || `${member.profile.full_name ?? ""} ${member.profile.email ?? ""}`.toLowerCase().includes(query))
    .filter((member) => (filters?.planId ? member.plan?.id === filters.planId : true))
    .filter((member) => (filters?.status ? member.subscription?.status === filters.status : true))
    .sort((a, b) => new Date(b.profile.created_at ?? 0).getTime() - new Date(a.profile.created_at ?? 0).getTime());
}

export async function getMemberById(id: string): Promise<MemberListItem | null> {
  const supabase = createSupabaseAdminClient() as any;
  const [profileResult, authResult, subscriptionResult, plansResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.auth.admin.getUserById(id).catch(() => ({ data: { user: null } })),
    supabase.from("subscriptions").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("plans").select("*"),
  ]);

  const profile = profileResult.data ?? null;
  const authUser = authResult?.data?.user ?? null;
  if (!profile && !authUser) return null;

  const mergedProfile = authUser ? makeProfileFromAuthUser(authUser, profile) : (profile as Profile);
  const typedSubscription = subscriptionResult.data ? (subscriptionResult.data as Subscription) : null;
  const typedPlans = (plansResult.data ?? []) as Plan[];
  const plan = typedSubscription?.plan_id ? typedPlans.find((item) => item.id === typedSubscription.plan_id) ?? null : null;

  return { profile: mergedProfile, subscription: typedSubscription, plan };
}

function rowMatchesIdentifiers(row: any, identifiers: string[]) {
  if (!identifiers.length) return false;
  const serialized = JSON.stringify(row ?? {}).toLowerCase();
  return identifiers.some((identifier) => serialized.includes(identifier.toLowerCase()));
}

function uniqueRows(rows: any[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row?.id ? `id:${row.id}` : JSON.stringify(row ?? {});
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numericString(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

async function safeTableQuery<T = any>(queryPromise: PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  try {
    const { data, error } = await queryPromise;
    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

function getMemberIdentifiers(member: MemberListItem) {
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  return Array.from(
    new Set(
      [
        profile?.id,
        profile?.email,
        subscription?.stripe_customer_id,
        subscription?.gateway_customer_id,
        subscription?.stripe_subscription_id,
        subscription?.gateway_subscription_id,
        subscription?.stripe_price_id,
        subscription?.legacy_pms_subscription_id,
        profile?.legacy_pms_member_id,
      ]
        .filter(Boolean)
        .map(String),
    ),
  );
}

export async function getSubscriberJourneyData(member: MemberListItem): Promise<SubscriberJourneyData> {
  const supabase = createSupabaseAdminClient() as any;
  const profile = member.profile as any;
  const subscription = member.subscription as any;
  const userId = profile?.id;
  const legacySubscriptionId = numericString(subscription?.legacy_pms_subscription_id);
  const legacyMemberId = numericString(profile?.legacy_pms_member_id);
  const identifiers = getMemberIdentifiers(member);

  const [communicationByUser, communicationRecent, kitAccessLogs, audioAccessLogs, webhookLogsRaw, webhookProcessedEventsRaw, legacyPmsBySubscription, legacyPmsByUser, legacyPmsRecent, legacyStripeRaw, legacyStripeImportRaw] = await Promise.all([
    userId ? safeTableQuery(supabase.from("communication_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100)) : Promise.resolve([]),
    safeTableQuery(supabase.from("communication_logs").select("*").order("created_at", { ascending: false }).limit(500)),
    userId ? safeTableQuery(supabase.from("kit_access_logs").select("*").eq("user_id", userId).order("accessed_at", { ascending: false }).limit(100)) : Promise.resolve([]),
    userId ? safeTableQuery(supabase.from("audio_access_logs").select("*").eq("user_id", userId).order("accessed_at", { ascending: false }).limit(100)) : Promise.resolve([]),
    safeTableQuery(supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).limit(500)),
    safeTableQuery(supabase.from("webhook_processed_events").select("*").order("processed_at", { ascending: false }).limit(500)),
    legacySubscriptionId ? safeTableQuery(supabase.from("legacy_pms_subscriptions").select("*").eq("pms_subscription_id", legacySubscriptionId).limit(25)) : Promise.resolve([]),
    legacyMemberId ? safeTableQuery(supabase.from("legacy_pms_subscriptions").select("*").eq("pms_user_id", legacyMemberId).limit(25)) : Promise.resolve([]),
    safeTableQuery(supabase.from("legacy_pms_subscriptions").select("*").limit(500)),
    safeTableQuery(supabase.from("legacy_stripe_customers").select("*").limit(500)),
    safeTableQuery(supabase.from("legacy_stripe_customer_import").select("*").limit(500)),
  ]);

  const communicationLogs = uniqueRows([...communicationByUser, ...communicationRecent.filter((row) => rowMatchesIdentifiers(row, identifiers))]).slice(0, 100);
  const legacyPmsSubscriptions = uniqueRows([...legacyPmsBySubscription, ...legacyPmsByUser, ...legacyPmsRecent.filter((row) => rowMatchesIdentifiers(row, identifiers))]).slice(0, 50);

  return {
    communicationLogs,
    kitAccessLogs,
    audioAccessLogs,
    webhookLogs: webhookLogsRaw.filter((row) => rowMatchesIdentifiers(row, identifiers)).slice(0, 100),
    webhookProcessedEvents: webhookProcessedEventsRaw.filter((row) => rowMatchesIdentifiers(row, identifiers)).slice(0, 100),
    legacyPmsSubscriptions,
    legacyStripeCustomers: legacyStripeRaw.filter((row) => rowMatchesIdentifiers(row, identifiers)).slice(0, 50),
    legacyStripeCustomerImports: legacyStripeImportRaw.filter((row) => rowMatchesIdentifiers(row, identifiers)).slice(0, 50),
  };
}

export async function getMemberOperationalSummaries(members: MemberListItem[], options: { limit?: number } = {}): Promise<Map<string, Partial<SubscriberJourneyData>>> {
  const supabase = createSupabaseAdminClient() as any;
  const targetMembers = members.slice(0, Math.min(options.limit ?? 100, 100));
  const userIds = targetMembers.map((member) => member.profile.id).filter(Boolean);
  const summaries = new Map<string, Partial<SubscriberJourneyData>>();
  const identifiersByUser = new Map<string, string[]>();

  for (const member of targetMembers) {
    const userId = member.profile.id;
    if (!userId) continue;
    summaries.set(userId, { communicationLogs: [], kitAccessLogs: [], audioAccessLogs: [], webhookLogs: [], webhookProcessedEvents: [], legacyPmsSubscriptions: [], legacyStripeCustomers: [], legacyStripeCustomerImports: [] });
    identifiersByUser.set(userId, getMemberIdentifiers(member));
  }

  if (!userIds.length) return summaries;

  const directLimit = Math.min(Math.max(userIds.length * 3, 100), 500);
  const [communicationLogs, kitAccessLogs, audioAccessLogs, webhookLogsRaw, webhookProcessedEventsRaw] = await Promise.all([
    safeTableQuery(supabase.from("communication_logs").select("*").in("user_id", userIds).order("created_at", { ascending: false }).limit(directLimit)),
    safeTableQuery(supabase.from("kit_access_logs").select("*").in("user_id", userIds).order("accessed_at", { ascending: false }).limit(directLimit)),
    safeTableQuery(supabase.from("audio_access_logs").select("*").in("user_id", userIds).order("accessed_at", { ascending: false }).limit(directLimit)),
    safeTableQuery(supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).limit(500)),
    safeTableQuery(supabase.from("webhook_processed_events").select("*").order("processed_at", { ascending: false }).limit(500)),
  ]);

  for (const [key, logs] of [["communicationLogs", communicationLogs], ["kitAccessLogs", kitAccessLogs], ["audioAccessLogs", audioAccessLogs]] as const) {
    for (const log of logs) {
      const userId = String((log as any)?.user_id ?? "");
      const summary = summaries.get(userId);
      if (summary) (summary as any)[key] = [...((summary as any)[key] ?? []), log];
    }
  }

  for (const [userId, identifiers] of identifiersByUser.entries()) {
    const summary = summaries.get(userId);
    if (!summary) continue;
    summary.webhookLogs = webhookLogsRaw.filter((row) => rowMatchesIdentifiers(row, identifiers)).slice(0, 20);
    summary.webhookProcessedEvents = webhookProcessedEventsRaw.filter((row) => rowMatchesIdentifiers(row, identifiers)).slice(0, 20);
  }

  return summaries;
}

export async function updateMemberSubscription(userId: string, payload: Database["public"]["Tables"]["subscriptions"]["Update"]): Promise<void> {
  const supabase = createSupabaseAdminClient() as any;
  const { data: existing } = await supabase.from("subscriptions").select("id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("subscriptions").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw new Error(`Falha ao atualizar assinatura: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("subscriptions").insert({ user_id: userId, ...payload, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Falha ao criar assinatura: ${error.message}`);
}

export async function cancelMemberSubscription(userId: string): Promise<void> {
  await updateMemberSubscription(userId, { status: "canceled", auto_renew: false });
}

export async function reactivateMemberSubscription(userId: string): Promise<void> {
  await updateMemberSubscription(userId, { status: "active", auto_renew: true });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase() || null;
}

async function deleteIfIds(supabase: any, table: string, column: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return;
  await supabase.from(table).delete().in(column, uniqueIds);
}

export async function deleteMember(userId: string): Promise<void> {
  const supabase = createSupabaseAdminClient() as any;
  const [{ data: profile }, authResult] = await Promise.all([
    supabase.from("profiles").select("id,email").eq("id", userId).maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const email = normalizeEmail(profile?.email ?? authResult?.data?.user?.email);
  const { data: duplicateProfiles } = email ? await supabase.from("profiles").select("id,email").ilike("email", email) : { data: [] };
  const userIds = Array.from(new Set([userId, ...((duplicateProfiles ?? []).map((item: any) => item.id).filter(Boolean))]));

  const { data: playlists } = await supabase.from("playlists").select("id").in("user_id", userIds.length ? userIds : [userId]);
  const playlistIds = (playlists ?? []).map((playlist: any) => playlist.id).filter(Boolean);

  await deleteIfIds(supabase, "playlist_items", "playlist_id", playlistIds);
  await Promise.allSettled([
    deleteIfIds(supabase, "kit_access_logs", "user_id", userIds),
    deleteIfIds(supabase, "audio_access_logs", "user_id", userIds),
    deleteIfIds(supabase, "marketing_events", "user_id", userIds),
    deleteIfIds(supabase, "communication_logs", "user_id", userIds),
    deleteIfIds(supabase, "communication_campaigns", "created_by", userIds),
    deleteIfIds(supabase, "ministry_members", "user_id", userIds),
    deleteIfIds(supabase, "ministry_activity_logs", "actor_user_id", userIds),
    deleteIfIds(supabase, "subscriptions", "user_id", userIds),
    deleteIfIds(supabase, "playlists", "user_id", userIds),
    email ? supabase.from("ministry_invites").delete().ilike("email", email) : Promise.resolve(),
    deleteIfIds(supabase, "profiles", "id", userIds),
  ]);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Falha ao excluir usuário Auth: ${error.message}`);
}
