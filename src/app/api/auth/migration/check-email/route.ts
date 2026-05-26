import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return NextResponse.json({ migrated: false });

    const supabase = await createClient();
    const { data: legacyMember } = await (supabase as any)
      .from("legacy_members")
      .select("legacy_plan_slug,legacy_status,migrated,password_created")
      .ilike("email", email)
      .maybeSingle();

    const shouldMigrate =
      !!legacyMember &&
      String(legacyMember.legacy_plan_slug ?? "").toLowerCase() === "free" &&
      String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created);

    return NextResponse.json({ migrated: shouldMigrate });
  } catch {
    return NextResponse.json({ migrated: false });
  }
}
