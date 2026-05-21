import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAccessContext } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const context = await getCurrentUserAccessContext();

  return NextResponse.json({
    authError: error?.message ?? null,
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email,
        }
      : null,
    profile: context.profile
      ? {
          id: context.profile.id,
          email: context.profile.email,
          role: context.profile.role,
        }
      : null,
    isGuest: context.isGuest,
    isAdmin: context.isAdmin,
    effectiveSlug: context.effectiveSlug,
  });
}
