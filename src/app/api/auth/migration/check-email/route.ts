import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeLegacyPlanSlug(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function hasMappedLegacyPlan(admin: any, value: unknown) {
  const slug = normalizeLegacyPlanSlug(value);
  if (!slug) return false;

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  return Boolean(plan?.id);
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

    const eligibleLegacyMember =
      !!legacyMember &&
      String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created);

    if (!eligibleLegacyMember) return NextResponse.json({ migrated: false });

    return NextResponse.json({ migrated: await hasMappedLegacyPlan(admin, legacyMember.legacy_plan_slug) });
  } catch {
    return NextResponse.json({ migrated: false });
  }
}
