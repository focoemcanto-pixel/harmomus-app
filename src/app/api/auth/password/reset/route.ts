import { NextResponse } from "next/server";

import { finalizeLegacyMigration } from "@/lib/auth/finalize-legacy-migration";
import { sendEmail } from "@/lib/email/send-email";
import { trustedAppUrl } from "@/lib/security/trusted-app-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function recoveryEmailHtml(link: string, migration = false) {
  return `
    <div style="margin:0;background:#07090f;padding:32px 16px;font-family:Arial,sans-serif;color:#f8fafc">
      <div style="max-width:560px;margin:0 auto;border:1px solid #293042;border-radius:20px;background:#111622;padding:32px">
        <h1 style="margin:0 0 12px;font-size:26px">${migration ? "Crie sua senha no Harmomus" : "Redefinição de senha"}</h1>
        <p style="margin:0 0 24px;color:#cbd5e1;line-height:1.6">
          ${migration
            ? "Encontramos seu cadastro anterior no Harmomus. Crie uma senha para concluir a migração da sua conta."
            : "Recebemos uma solicitação para alterar a senha da sua conta Harmomus."}
        </p>
        <a href="${link}" style="display:inline-block;border-radius:12px;background:#22d3ee;color:#071018;text-decoration:none;font-weight:700;padding:14px 22px">
          ${migration ? "Criar minha senha" : "Criar nova senha"}
        </a>
        <p style="margin:24px 0 0;color:#94a3b8;font-size:13px;line-height:1.5">
          Caso você não tenha solicitado esta alteração, ignore este e-mail. O link é de uso único.
        </p>
      </div>
    </div>
  `;
}

function recoveryErrorUrl(request: Request) {
  return trustedAppUrl("/recuperar-senha?error=1", request);
}

function recoverySuccessUrl(request: Request, migration = false) {
  const url = trustedAppUrl("/recuperar-senha?success=1", request);
  if (migration) url.searchParams.set("migration", "1");
  return url;
}

async function findAuthUserByEmail(admin: any, email: string) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    const found = users.find(
      (user: any) => String(user?.email ?? "").trim().toLowerCase() === email,
    );
    if (found) return found;
    if (users.length < perPage) return null;
  }

  throw new Error("AUTH_USER_SEARCH_LIMIT_REACHED");
}

async function ensureLegacyUser(admin: any, email: string) {
  const { data: legacyMember, error: legacyError } = await admin
    .from("legacy_members")
    .select("id,email,display_name,legacy_status,migrated,password_created,supabase_user_id,legacy_plan_slug")
    .ilike("email", email)
    .maybeSingle();

  if (legacyError || !legacyMember) return { migration: false, userId: null as string | null };
  if (String(legacyMember.legacy_status ?? "").toLowerCase() !== "active") {
    return { migration: false, userId: null as string | null };
  }

  if (legacyMember.supabase_user_id) {
    return { migration: true, userId: String(legacyMember.supabase_user_id) };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: legacyMember.display_name ?? null,
      migrated_from_pms: true,
    },
  });

  if (createError || !created?.user?.id) {
    console.error("[auth.password.reset] legacy auth user creation failed", {
      email,
      error: createError,
    });
    throw new Error("LEGACY_USER_CREATE_FAILED");
  }

  const userId = created.user.id;
  const now = new Date().toISOString();

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: legacyMember.display_name ?? null,
      role: "member",
      migrated_from_pms: true,
      requires_password_setup: true,
      password_setup_completed_at: null,
      onboarding_status: "active",
      onboarding_step: "completed",
      email_verified_at: now,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("[auth.password.reset] legacy profile preparation failed", {
      email,
      userId,
      error: profileError,
    });
    throw new Error("LEGACY_PROFILE_PREPARE_FAILED");
  }

  const { error: legacyUpdateError } = await admin
    .from("legacy_members")
    .update({
      migrated: true,
      password_created: false,
      supabase_user_id: userId,
      migrated_at: now,
    })
    .eq("id", legacyMember.id);

  if (legacyUpdateError) {
    console.error("[auth.password.reset] legacy member preparation failed", {
      email,
      userId,
      error: legacyUpdateError,
    });
    throw new Error("LEGACY_MEMBER_PREPARE_FAILED");
  }

  try {
    await finalizeLegacyMigration(admin, { userId, email });
    await admin
      .from("profiles")
      .update({
        requires_password_setup: true,
        password_setup_completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    await admin
      .from("legacy_members")
      .update({ password_created: false })
      .eq("id", legacyMember.id);
  } catch (error) {
    console.error("[auth.password.reset] legacy access preparation failed", {
      email,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("LEGACY_ACCESS_PREPARE_FAILED");
  }

  return { migration: true, userId };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.redirect(recoveryErrorUrl(request), 303);
  }

  try {
    const admin = createSupabaseAdminClient() as any;
    const existingAuthUser = await findAuthUserByEmail(admin, email);
    let migration = false;

    if (!existingAuthUser) {
      const legacy = await ensureLegacyUser(admin, email);
      migration = legacy.migration;
    } else {
      const { data: profile } = await admin
        .from("profiles")
        .select("migrated_from_pms,requires_password_setup")
        .eq("id", existingAuthUser.id)
        .maybeSingle();
      migration = Boolean(profile?.migrated_from_pms && profile?.requires_password_setup);
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (error) {
      console.error("[auth.password.reset] generateLink failed", { email, error });
      return NextResponse.redirect(recoveryErrorUrl(request), 303);
    }

    const tokenHash = String(data?.properties?.hashed_token ?? "").trim();

    if (!tokenHash) {
      console.error("[auth.password.reset] generated link without hashed token", { email });
      return NextResponse.redirect(recoveryErrorUrl(request), 303);
    }

    const recoveryUrl = trustedAppUrl("/redefinir-senha", request);
    recoveryUrl.searchParams.set("token_hash", tokenHash);
    recoveryUrl.searchParams.set("type", "recovery");
    if (migration) recoveryUrl.searchParams.set("migration", "1");

    const sent = await sendEmail({
      to: email,
      subject: migration ? "Crie sua senha no Harmomus" : "Redefina sua senha no Harmomus",
      html: recoveryEmailHtml(recoveryUrl.toString(), migration),
      text: `${migration ? "Crie" : "Redefina"} sua senha no Harmomus: ${recoveryUrl.toString()}`,
    });

    if (!sent.ok) {
      console.error("[auth.password.reset] recovery email failed", {
        email,
        migration,
        error: sent.error,
      });
      return NextResponse.redirect(recoveryErrorUrl(request), 303);
    }

    console.info("[auth.password.reset] recovery email sent", {
      email,
      migration,
      deliveryId: sent.id ?? null,
    });

    return NextResponse.redirect(recoverySuccessUrl(request, migration), 303);
  } catch (error) {
    console.error("[auth.password.reset] unexpected failure", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.redirect(recoveryErrorUrl(request), 303);
  }
}
