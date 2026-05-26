import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (password.length < 6) return NextResponse.redirect(new URL("/redefinir-senha?error=A+senha+deve+ter+pelo+menos+6+caracteres.", request.url), 303);
  if (password !== confirmPassword) return NextResponse.redirect(new URL("/redefinir-senha?error=As+senhas+n%C3%A3o+conferem.", request.url), 303);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.updateUser({ password });

  if (error) return NextResponse.redirect(new URL("/redefinir-senha?error=N%C3%A3o+foi+poss%C3%ADvel+redefinir+a+senha.", request.url), 303);

  const userEmail = data.user?.email?.toLowerCase();
  const formMigration = String(formData.get("migration") ?? "");
  const migration = formMigration === "1";

  if (userEmail) {
    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient() as any;

    const { data: profile } = await admin
      .from("profiles")
      .select("requires_password_setup")
      .ilike("email", userEmail)
      .maybeSingle();

    if (profile?.requires_password_setup) {
      await admin
        .from("profiles")
        .update({ requires_password_setup: false, password_setup_completed_at: now })
        .ilike("email", userEmail);
    }

    if (migration) {
      await admin
        .from("legacy_members")
        .update({ password_created: true, migrated_at: now })
        .ilike("email", userEmail);
    }
  }

  return NextResponse.redirect(new URL(migration ? "/login?migration=success" : "/login?reset=success", request.url), 303);
}
