import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { registerKitAccess, resolveKitAccess } from "@/lib/access/access-rules";
import { getPublishedKitById } from "@/lib/data/public-kits";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await getPublishedKitById(id);

  if (!kit) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const current = await getCurrentUserAccessContext();
  const access = await resolveKitAccess(current, kit);

  if (current.isGuest || !current.profile) {
    return NextResponse.json({ ok: false, reason: "guest" }, { status: 401 });
  }

  if (!access.play.allowed) {
    return NextResponse.json({ ok: false, reason: access.play.reason, stats: access.play.stats ?? null }, { status: 403 });
  }

  if (current.effectiveSlug !== "free") {
    return NextResponse.json({ ok: true, stats: access.play.stats ?? null });
  }

  const stats = await registerKitAccess(current.profile.id, kit.id);
  return NextResponse.json({ ok: true, stats });
}
