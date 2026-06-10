import { createClient } from "@/lib/supabase/server";
import { resolveEffectivePlan } from "@/lib/access/subscription-plan";

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

  const { planSlug, hierarchyLevel } = resolveEffectiveSubscriptionPlan(subscription);

  return {
    isLoggedIn: true,
    planSlug,
    hierarchyLevel,
    subscriptionStatus: String(subscription?.status ?? "none"),
  };
}
