import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) return NextResponse.json({ migrated: false });

    const supabase = await createClient();
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("migrated_from_pms, requires_password_setup")
      .eq("email", email)
      .maybeSingle();

    if (!profile?.migrated_from_pms || !profile.requires_password_setup) return NextResponse.json({ migrated: false });
    return NextResponse.json({ migrated: true, requires_password_setup: true });
  } catch {
    return NextResponse.json({ migrated: false });
  }
}
