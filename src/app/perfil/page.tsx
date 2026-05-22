import { redirect } from "next/navigation";

import { ProfilePageClient } from "@/components/public/profile-page-client";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export default async function PerfilPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");

  const supabase = await createClient();
  const userId = context.profile?.id ?? "";
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString();

  const [{ count: playlists }, { count: kitsToday }, { count: history }] = await Promise.all([
    (supabase as any).from("playlists").select("id", { count: "exact", head: true }).eq("user_id", userId),
    (supabase as any).from("kit_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("accessed_at", start),
    (supabase as any).from("kit_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  return <ProfilePageClient
    userId={userId}
    initialName={context.profile?.full_name ?? "Sem nome"}
    email={context.profile?.email ?? "Sem e-mail"}
    username={(context.profile?.email ?? "user").split("@")[0]}
    avatarUrl={context.profile?.avatar_url ?? null}
    planName={context.plan?.name ?? "Free"}
    subscriptionStatus={context.subscription?.status ?? "inactive"}
    stats={{ playlists: playlists ?? 0, favorites: 0, history: history ?? 0, kitsToday: kitsToday ?? 0 }}
  />;
}
