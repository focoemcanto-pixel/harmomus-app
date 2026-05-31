import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isSupportedLegacyPlan(value: unknown) {
  const slug = String(value ?? "").trim().toLowerCase();
  return ["free", "plus", "premium", "ministry_10", "ministry_20", "ministry_40"].includes(slug);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return NextResponse.json({ migrated: false });

    const admin = createSupabaseAdminClient() as any;
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existingProfile?.id) return NextResponse.json({ migrated: false });

    const { data: legacyMember } = await admin
      .from("legacy_members")
      .select("legacy_plan_slug,legacy_status,migrated,password_created")
      .ilike("email", email)
      .maybeSingle();

    const shouldMigrate =
      !!legacyMember &&
      isSupportedLegacyPlan(legacyMember.legacy_plan_slug) &&
      String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created);

    return NextResponse.json({ migrated: shouldMigrate });
  } catch {
    return NextResponse.json({ migrated: false });
  }
}
