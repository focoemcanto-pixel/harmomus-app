import { redirect } from "next/navigation";

import { ProfilePageClient } from "@/components/public/profile-page-client";
import { PublicAppShell } from "@/components/public/public-app-shell";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function safeCount(query: PromiseLike<{ count: number | null; error?: unknown }>) {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function PerfilPage() {
  const context = await getCurrentUserAccessContext();
  if (context.isGuest) redirect("/login");

  const supabase = createSupabaseAdminClient() as any;
  const authClient = await createClient();
  const { data: auth } = await authClient.auth.getUser();
  const authUser = auth.user;
  const userId = context.profile?.id ?? authUser?.id ?? "";
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString();

  const [playlists, favorites, kitsToday, history] = await Promise.all([
    safeCount((supabase as any).from("playlists").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    safeCount((supabase as any).from("kit_favorites").select("id", { count: "exact", head: true }).eq("user_id", userId)),
    safeCount((supabase as any).from("audio_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "allowed").gte("accessed_at", start)),
    safeCount((supabase as any).from("audio_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "allowed")),
  ]);

  return <PublicAppShell><ProfilePageClient
    userId={userId}
    initialName={context.profile?.full_name ?? "Sem nome"}
    email={context.profile?.email ?? authUser?.email ?? "Sem e-mail"}
    username={(context.profile?.email ?? authUser?.email ?? "user").split("@")[0]}
    avatarUrl={context.profile?.avatar_url ?? null}
    planName={context.plan?.name ?? "Free"}
    subscriptionStatus={context.subscription?.status ?? "inactive"}
    emailConfirmed={Boolean((authUser as any)?.email_confirmed_at ?? (authUser as any)?.confirmed_at)}
    stats={{ playlists, favorites, history, kitsToday }}
  /></PublicAppShell>;
}
