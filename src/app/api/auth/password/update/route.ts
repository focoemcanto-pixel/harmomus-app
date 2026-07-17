import { NextResponse } from "next/server";

import { finalizeLegacyMigration } from "@/lib/auth/finalize-legacy-migration";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { trustedAppUrl } from "@/lib/security/trusted-app-url";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";

export const dynamic = "force-dynamic";

function passwordErrorUrl(
  request: Request,
  message: string,
  migration: boolean,
  tokenHash?: string,
) {
  const url = trustedAppUrl("/redefinir-senha", request);
  url.searchParams.set("error", message);
  if (migration) url.searchParams.set("migration", "1");
  if (tokenHash) {
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", "recovery");
  }
  return url;
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const formTokenHash = String(formData.get("token_hash") ?? "").trim();
  const queryTokenHash = String(requestUrl.searchParams.get("token_hash") ?? "").trim();
  const tokenHash = formTokenHash || queryTokenHash;
  const formMigration = String(formData.get("migration") ?? "");
  const queryMigration = requestUrl.searchParams.get("migration") === "1";
  const migration = formMigration === "1" || queryMigration;

  if (password.length < 6) {
    return NextResponse.redirect(
      passwordErrorUrl(request, "A senha deve ter pelo menos 6 caracteres.", migration, tokenHash),
      303,
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.redirect(
      passwordErrorUrl(request, "As senhas não conferem.", migration, tokenHash),
      303,
    );
  }

  const admin = createSupabaseAdminClient() as any;
  const supabase = await createClient();
  let authenticatedUser: any = null;

  if (tokenHash) {
    const { data: verificationData, error: verificationError } = await admin.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });

    if (verificationError || !verificationData?.user?.id) {
      console.error("[auth.password.update] recovery token verification failed", {
        hasFormToken: Boolean(formTokenHash),
        hasQueryToken: Boolean(queryTokenHash),
        error: verificationError,
      });
      return NextResponse.redirect(
        passwordErrorUrl(
          request,
          "Link inválido ou expirado. Solicite uma nova redefinição de senha.",
          migration,
        ),
        303,
      );
    }

    authenticatedUser = verificationData.user;
  } else {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    authenticatedUser = authData.user;

    if (authError || !authenticatedUser?.id) {
      console.error("[auth.password.update] recovery token and session unavailable", authError);
      return NextResponse.redirect(
        passwordErrorUrl(
          request,
          "O link de recuperação não chegou completo. Solicite um novo link e abra o e-mail mais recente.",
          migration,
        ),
        303,
      );
    }
  }

  const { data: updatedAuthData, error: updateError } = await admin.auth.admin.updateUserById(
    authenticatedUser.id,
    { password, email_confirm: true },
  );

  if (updateError) {
    console.error("[auth.password.update] admin password update failed", {
      userId: authenticatedUser.id,
      error: updateError,
    });
    return NextResponse.redirect(
      passwordErrorUrl(
        request,
        "Não foi possível redefinir a senha. Solicite um novo link e tente novamente.",
        migration,
        tokenHash,
      ),
      303,
    );
  }

  const updatedUser = updatedAuthData?.user ?? authenticatedUser;
  const userEmail = updatedUser.email?.toLowerCase();
  let completedMigration = migration;

  if (migration) {
    if (!userEmail) {
      return NextResponse.redirect(
        passwordErrorUrl(request, "Não foi possível identificar o e-mail da migração.", true),
        303,
      );
    }

    try {
      await finalizeLegacyMigration(admin, {
        userId: authenticatedUser.id,
        email: userEmail,
      });
      completedMigration = true;
    } catch (error) {
      console.error("[auth.password.update] falha ao finalizar migração validada", {
        userId: authenticatedUser.id,
        email: userEmail,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.redirect(
        passwordErrorUrl(
          request,
          "Sua senha foi validada, mas não foi possível concluir a migração. Entre em contato com o suporte.",
          true,
        ),
        303,
      );
    }
  }

  if (userEmail) {
    const now = new Date().toISOString();
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name,email,phone,migrated_from_pms,requires_password_setup")
      .ilike("email", userEmail)
      .maybeSingle();

    const isMigratedProfile = Boolean(profile?.migrated_from_pms);
    completedMigration = completedMigration || isMigratedProfile;

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
        recipient: {
          name: profile?.full_name ?? null,
          email: profile?.email ?? userEmail,
          phone: profile?.phone ?? null,
        },
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

  if (!tokenHash) {
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    if (signOutError) console.error("[auth.password.update] signOut after password reset failed", signOutError);
  }

  const destination = completedMigration ? "/login?migration=success" : "/login?reset=success";
  return NextResponse.redirect(trustedAppUrl(destination, request), 303);
}
