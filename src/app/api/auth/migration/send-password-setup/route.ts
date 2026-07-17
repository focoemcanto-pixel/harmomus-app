import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTrustedAppOrigin, trustedAppUrl } from "@/lib/security/trusted-app-url";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function verificationRedirect(request: Request, email: string) {
  const url = trustedAppUrl("/cadastro/verifique-email", request);
  url.searchParams.set("migration", "1");
  url.searchParams.set("email", email);
  return NextResponse.redirect(url, 303);
}

function formRedirect(request: Request) {
  return NextResponse.redirect(trustedAppUrl("/definir-senha-migrada", request), 303);
}

function hasTrustedOrigin(request: Request) {
  const expected = getTrustedAppOrigin(request);
  const supplied = request.headers.get("origin") || request.headers.get("referer");
  if (!supplied) return process.env.NODE_ENV !== "production";
  try {
    return new URL(supplied).origin === expected;
  } catch {
    return false;
  }
}

async function findAuthUserId(admin: any, email: string) {
  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    const found = users.find((user: any) => normalizeEmail(user.email) === email);
    if (found?.id) return String(found.id);
    if (users.length < perPage) return null;
    page += 1;
  }

  return null;
}

export async function POST(request: Request) {
  let email = "";

  try {
    if (!hasTrustedOrigin(request)) {
      return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    }

    const formData = await request.formData();
    email = normalizeEmail(formData.get("email"));
    if (!isValidEmail(email)) return formRedirect(request);

    const admin = createSupabaseAdminClient() as any;
    const supabase = await createClient();

    const { data: legacyMember, error: legacyError } = await admin
      .from("legacy_members")
      .select("id,email,display_name,legacy_status,migrated,password_created")
      .ilike("email", email)
      .maybeSingle();

    const eligible =
      !legacyError &&
      !!legacyMember?.id &&
      String(legacyMember.legacy_status ?? "").trim().toLowerCase() === "active" &&
      (!legacyMember.migrated || !legacyMember.password_created);

    // Resposta deliberadamente genérica para não confirmar se o e-mail existe na base legada.
    if (!eligible) return verificationRedirect(request, email);

    let userId = await findAuthUserId(admin, email);
    if (!userId) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: {
          full_name: legacyMember.display_name ?? "",
          pending_legacy_migration: true,
        },
      });
      if (createError) throw createError;
      userId = String(created.user?.id ?? "");
    }

    if (!userId) throw new Error("Usuário Auth não preparado.");

    const callbackUrl = trustedAppUrl("/auth/confirm/callback", request);
    callbackUrl.searchParams.set("type", "recovery");
    callbackUrl.searchParams.set("next", "/redefinir-senha?migration=1");

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl.toString(),
    });
    if (resetError) throw resetError;
  } catch (error) {
    console.error("[migration.send-password-setup] falha ao preparar link", {
      email,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // A interface recebe sempre o mesmo resultado; detalhes internos ficam apenas nos logs.
  return verificationRedirect(request, email);
}
