import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type MinistryPlanSlug = "ministry_10" | "ministry_20" | "ministry_40";

export function isMinistryPlanSlug(value?: string | null): value is MinistryPlanSlug {
  return ["ministry_10", "ministry_20", "ministry_40"].includes(String(value ?? ""));
}

export function getMinistrySeatLimit(planSlug?: string | null) {
  if (planSlug === "ministry_40") return 40;
  if (planSlug === "ministry_20") return 20;
  if (planSlug === "ministry_10") return 10;
  return 0;
}

export function canRequestSongsAndTones(input: {
  isAdmin?: boolean;
  ministryRole?: string | null;
  effectiveSlug?: string | null;
}) {
  if (input.isAdmin) return true;
  if (input.ministryRole === "owner") return true;
  return input.effectiveSlug === "premium" && !input.ministryRole;
}

export async function countActiveMinistryMembers(ministryId: string) {
  const supabase = (await createClient()) as any;

  const { count } = await supabase
    .from("ministry_members")
    .select("id", { count: "exact", head: true })
    .eq("ministry_id", ministryId)
    .eq("status", "active");

  return count ?? 0;
}

export async function ensureMinistryForSubscription(input: {
  userId: string;
  planSlug: string | null;
  subscriptionId?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
}) {
  if (!isMinistryPlanSlug(input.planSlug)) return null;

  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();
  const seatLimit = getMinistrySeatLimit(input.planSlug);

  const { data: profile } = await admin
    .from("profiles")
    .select("id,full_name,email")
    .eq("id", input.userId)
    .maybeSingle();

  const ministryPayload = {
    owner_id: input.userId,
    subscription_id: input.subscriptionId ?? null,
    name: profile?.full_name ? `Ministério de ${profile.full_name}` : "Meu Ministério",
    plan_type: input.planSlug,
    seat_limit: seatLimit,
    status: ["active", "trialing"].includes(String(input.status ?? "")) ? "active" : "pending",
    stripe_customer_id: input.stripeCustomerId ?? null,
    stripe_subscription_id: input.stripeSubscriptionId ?? null,
    current_period_end: input.currentPeriodEnd ?? null,
    trial_ends_at: input.trialEndsAt ?? null,
    updated_at: now,
  };

  const { data: existing } = await admin
    .from("ministries")
    .select("id")
    .eq("owner_id", input.userId)
    .maybeSingle();

  const saveResponse = existing?.id
    ? await admin.from("ministries").update(ministryPayload).eq("id", existing.id).select("*").single()
    : await admin.from("ministries").insert({ ...ministryPayload, created_at: now }).select("*").single();

  if (saveResponse.error) {
    throw new Error(saveResponse.error.message);
  }

  const ministry = saveResponse.data;

  const { data: ownerMember } = await admin
    .from("ministry_members")
    .select("id")
    .eq("ministry_id", ministry.id)
    .eq("user_id", input.userId)
    .maybeSingle();

  const ownerPayload = {
    ministry_id: ministry.id,
    user_id: input.userId,
    invited_email: profile?.email ?? "",
    invited_name: profile?.full_name ?? "Responsável",
    role: "owner",
    status: "active",
    invited_by: input.userId,
    accepted_at: now,
    updated_at: now,
  };

  const ownerResponse = ownerMember?.id
    ? await admin.from("ministry_members").update(ownerPayload).eq("id", ownerMember.id)
    : await admin.from("ministry_members").insert({ ...ownerPayload, invited_at: now, created_at: now });

  if (ownerResponse.error) {
    throw new Error(ownerResponse.error.message);
  }

  return ministry;
}

export async function getOwnedMinistry(userId: string) {
  const admin = createSupabaseAdminClient() as any;

  const { data, error } = await admin
    .from("ministries")
    .select("*")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar ministério: ${error.message}`);
  return data ?? null;
}

export async function getMinistryMembers(ministryId: string) {
  const admin = createSupabaseAdminClient() as any;

  const { data, error } = await admin
    .from("ministry_members")
    .select("*, profile:profiles(id,full_name,email)")
    .eq("ministry_id", ministryId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Falha ao buscar membros: ${error.message}`);
  return data ?? [];
}

export async function getMinistryDashboard(userId: string) {
  const ministry = await getOwnedMinistry(userId);
  if (!ministry) return { ministry: null, members: [], activeSeats: 0, pendingSeats: 0, remainingSeats: 0 };

  const members = await getMinistryMembers(ministry.id);
  const activeSeats = members.filter((member: any) => ["active", "pending"].includes(String(member.status))).length;
  const pendingSeats = members.filter((member: any) => String(member.status) === "pending").length;
  const remainingSeats = Math.max(0, Number(ministry.seat_limit ?? 0) - activeSeats);

  return { ministry, members, activeSeats, pendingSeats, remainingSeats };
}
