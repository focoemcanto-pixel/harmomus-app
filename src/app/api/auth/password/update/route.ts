import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

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
  let completedMigration = migration;

  if (userEmail) {
    const now = new Date().toISOString();
    const admin = createSupabaseAdminClient() as any;

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name,email,phone,migrated_from_pms,requires_password_setup")
      .ilike("email", userEmail)
      .maybeSingle();

    const isMigratedProfile = Boolean(profile?.migrated_from_pms);
    completedMigration = migration || isMigratedProfile;

    if (profile?.requires_password_setup) {
      await admin
        .from("profiles")
        .update({ requires_password_setup: false, password_setup_completed_at: now })
        .ilike("email", userEmail);
    }

    if (completedMigration) {
      await admin
        .from("legacy_members")
        .update({ password_created: true, migrated_at: now })
        .ilike("email", userEmail);
    }

    try {
      await dispatchWebhookEvent({
        event: "user.password_reset",
        source: completedMigration ? "migration.password_setup" : "auth.password_reset",
        recipient: { name: profile?.full_name ?? null, email: profile?.email ?? userEmail, phone: profile?.phone ?? null },
        data: {
          nome: profile?.full_name ?? null,
          email: profile?.email ?? userEmail,
          telefone: profile?.phone ?? null,
          migrated_user: completedMigration,
          password_reset_at: now,
        },
      });
    } catch (webhookError) {
      console.error("[auth.password.update] webhook user.password_reset falhou", webhookError);
    }
  }

  return NextResponse.redirect(new URL(completedMigration ? "/login?migration=success" : "/login?reset=success", request.url), 303);
}
