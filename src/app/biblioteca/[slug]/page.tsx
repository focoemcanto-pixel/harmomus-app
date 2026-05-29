import { PublicAppShell } from "@/components/public/public-app-shell";
import { GlobalAudioPlayerProvider } from "@/components/public/global-audio-player-provider";
import { notFound } from "next/navigation";

import { FavoriteKitButton } from "@/components/public/favorite-kit-button";
import { KitPageTemplate } from "@/components/public/kit-page-template";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { registerKitAccess, resolveKitAccess } from "@/lib/access/access-rules";
import { canRequestSongsAndTones } from "@/lib/data/ministry";
import { isFavoriteKit } from "@/lib/data/favorites";
import { getPublishedKitBySlug } from "@/lib/data/public-kits";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BibliotecaKitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kit = await getPublishedKitBySlug(slug);
  if (!kit) notFound();

  const current = await getCurrentUserAccessContext();
  const accessContext = await resolveKitAccess(current, kit);
  const initialFavorited = current.isGuest ? false : await isFavoriteKit(kit.id).catch(() => false);

  if (accessContext.play.allowed && current.effectiveSlug === "free" && current.profile?.id) {
    accessContext.play.stats = await registerKitAccess(current.profile.id, kit.id);
  }

  if (!accessContext.play.allowed) {
    try {
      const supabase = await createClient();
      await (supabase as any).from("usage_tracking").insert({
        user_id: current.profile?.id ?? null,
        action: "premium_gate_viewed",
        metadata: {
          feature: "kit_page",
          kitId: kit.id,
          requiredPlan: kit.requiredPlan?.slug ?? null,
          userPlan: current.effectiveSlug,
        },
      });
    } catch {}
  }

  return (
    <PublicAppShell>
      <GlobalAudioPlayerProvider key={kit.id}>
        <KitPageTemplate kit={kit} accessContext={{ ...current, ...accessContext, canRequestSongsAndTones: canRequestSongsAndTones({ isAdmin: current.isAdmin, ministryRole: current.ministry?.role ?? null, effectiveSlug: current.effectiveSlug }) }} />
        {!current.isGuest ? <FavoriteKitButton kitId={kit.id} initialFavorited={initialFavorited} /> : null}
      </GlobalAudioPlayerProvider>
    </PublicAppShell>
  );
}
