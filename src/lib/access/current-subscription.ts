import { createClient } from "@/lib/supabase/server";
import { normalizePlan } from "@/lib/access/access-engine";

const PAID_ACCESS_STATUSES = new Set(["active", "trialing"]);

function resolveEffectivePlan(subscription: any) {
  const status = String(subscription?.status ?? "none").toLowerCase();
  const rawPlanSlug = normalizePlan(subscription?.plan?.slug);

  if (!PAID_ACCESS_STATUSES.has(status)) {
    return { planSlug: "free" as const, hierarchyLevel: 1 };
  }

  const hierarchyLevel = Number(
    subscription?.plan?.hierarchy_level ?? (rawPlanSlug === "premium" ? 3 : rawPlanSlug === "plus" ? 2 : 1),
  );

  return { planSlug: rawPlanSlug, hierarchyLevel };
}

export async function getCurrentSubscription() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) return { isLoggedIn: false, planSlug: "free", hierarchyLevel: 1, subscriptionStatus: "guest" };

  const { data: subscription } = await (supabase as any)
    .from("subscriptions")
    .select("status, plan:plans(slug,hierarchy_level)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { planSlug, hierarchyLevel } = resolveEffectivePlan(subscription);

  return {
    isLoggedIn: true,
    planSlug,
    hierarchyLevel,
    subscriptionStatus: String(subscription?.status ?? "none"),
  };
}
