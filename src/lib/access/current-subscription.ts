import { createClient } from "@/lib/supabase/server";
import { resolveEffectivePlan } from "@/lib/access/subscription-plan";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { activeHubPremiumGrant } from "@/lib/access/hub-grants";

function resolveEffectiveSubscriptionPlan(subscription: any) {
  const planSlug = resolveEffectivePlan({ subscription, plan: subscription?.plan });
  const hierarchyLevel = Number(
    planSlug === "premium" ? 3 : planSlug === "plus" ? 2 : 1,
  );

  return { planSlug, hierarchyLevel };
}

export async function getCurrentSubscription() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) return { isLoggedIn: false, planSlug: "free", hierarchyLevel: 1, subscriptionStatus: "guest" };

  const { data: subscription } = await (supabase as any)
    .from("subscriptions")
    .select("status,current_period_end,cancel_at_period_end,canceled_at,plan:plans(slug,hierarchy_level)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const resolved = resolveEffectiveSubscriptionPlan(subscription);
  // HUB-originated Premium (independent origin) also counts here.
  const hubGrant = resolved.planSlug === "premium" ? null : await activeHubPremiumGrant(createSupabaseAdminClient() as any, user.id);
  const { planSlug, hierarchyLevel } = hubGrant ? { planSlug: "premium" as const, hierarchyLevel: 3 } : resolved;

  return {
    isLoggedIn: true,
    planSlug,
    hierarchyLevel,
    subscriptionStatus: String(subscription?.status ?? "none"),
  };
}
