import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function redirectToMigrationPage(request: Request, email: string, error?: string) {
  const url = new URL("/definir-senha-migrada", request.url);
  url.searchParams.set("email", email);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url, 303);
}

function redirectToVerificationPage(request: Request, email: string) {
  const url = new URL("/cadastro/verifique-email", request.url);
  url.searchParams.set("migration", "1");
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!(email && email.includes("@"))) {
    return redirectToMigrationPage(request, email, "E-mail inválido");
  }

  const admin = createSupabaseAdminClient() as any;
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: existingProfile, error: profileLookupError } = await admin
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();

  if (profileLookupError) {
    return redirectToMigrationPage(request, email, `Erro ao verificar perfil:${profileLookupError.message}`);
  }

  const { data: legacyMember, error: legacyLookupError } = await admin
    .from("legacy_members")
    .select("id,email,display_name,legacy_plan_slug,legacy_status,migrated,password_created")
    .ilike("email", email)
    .maybeSingle();

  if (legacyLookupError) {
    return redirectToMigrationPage(request, email, `Erro ao verificar conta migrada:${legacyLookupError.message}`);
  }

  const eligible =
    !!legacyMember &&
    String(legacyMember.legacy_plan_slug ?? "").toLowerCase() === "free" &&
    String(legacyMember.legacy_status ?? "").toLowerCase() === "active" &&
    (!legacyMember.migrated || !legacyMember.password_created);

  if (!eligible) {
    return redirectToMigrationPage(request, email, "Conta migrada não encontrada ou já ativada");
  }

  let resolvedUserId = String(existingProfile?.id ?? "");

  if (!resolvedUserId) {
    let page = 1;
    const perPage = 200;

    while (!resolvedUserId) {
      const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page, perPage });
      if (listError) return redirectToMigrationPage(request, email, `Erro ao verificar usuário:${listError.message}`);

      const users = usersData?.users ?? [];
      const existingUser = users.find((user: any) => String(user.email ?? "").toLowerCase() === email);
      resolvedUserId = String(existingUser?.id ?? "");

      if (resolvedUserId || users.length < perPage) break;
      page += 1;
    }
  }

  if (!resolvedUserId) {
    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: legacyMember.display_name ?? "" },
    });

    if (createError) {
      return redirectToMigrationPage(request, email, `Erro ao criar usuário:${createError.message}`);
    }

    resolvedUserId = String(createdData.user?.id ?? "");
  }

  if (!resolvedUserId) {
    return redirectToMigrationPage(request, email, "Erro ao criar usuário: ID ausente");
  }

  const { error: profileUpsertError } = await admin.from("profiles").upsert(
    {
      id: resolvedUserId,
      email,
      full_name: legacyMember.display_name ?? null,
      role: "member",
      migrated_from_pms: true,
      requires_password_setup: true,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (profileUpsertError) {
    return redirectToMigrationPage(request, email, `Erro ao preparar perfil:${profileUpsertError.message}`);
  }

  const { data: freePlan, error: freePlanError } = await admin.from("plans").select("id,slug").eq("slug", "free").maybeSingle();

  if (freePlanError || !freePlan?.id) {
    return redirectToMigrationPage(request, email, `Erro ao localizar plano free:${freePlanError?.message ?? "plano ausente"}`);
  }

  const { data: activeSubscription, error: subscriptionLookupError } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", resolvedUserId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionLookupError) {
    return redirectToMigrationPage(request, email, `Erro ao verificar assinatura:${subscriptionLookupError.message}`);
  }

  if (activeSubscription?.id) {
    const { error: subscriptionUpdateError } = await admin
      .from("subscriptions")
      .update({
        plan_id: freePlan.id,
        gateway: "legacy",
        migrated_from_pms: true,
        updated_at: now,
      })
      .eq("id", activeSubscription.id);

    if (subscriptionUpdateError) {
      return redirectToMigrationPage(request, email, `Erro ao atualizar assinatura:${subscriptionUpdateError.message}`);
    }
  } else {
    const { error: subscriptionInsertError } = await admin.from("subscriptions").insert({
      user_id: resolvedUserId,
      plan_id: freePlan.id,
      status: "active",
      gateway: "legacy",
      migrated_from_pms: true,
      updated_at: now,
    });

    if (subscriptionInsertError) {
      return redirectToMigrationPage(request, email, `Erro ao criar assinatura:${subscriptionInsertError.message}`);
    }
  }

  const origin = new URL(request.url).origin;
  const callbackUrl = new URL("/auth/confirm/callback", origin);
  callbackUrl.searchParams.set("type", "recovery");
  callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");

  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl.toString() });

  if (resetError) {
    return redirectToMigrationPage(request, email, `Erro ao enviar e-mail:${resetError.message}`);
  }

  const { error: updateLegacyError } = await admin
    .from("legacy_members")
    .update({ migrated: true, supabase_user_id: resolvedUserId, migrated_at: now })
    .ilike("email", email);

  if (updateLegacyError) {
    return redirectToMigrationPage(request, email, `Erro ao atualizar legado:${updateLegacyError.message}`);
  }

  return redirectToVerificationPage(request, email);
}
