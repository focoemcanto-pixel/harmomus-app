import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TEST_EMAILS = [
  "marcoosmarquinhos10@hotmail.com",
  "markuezemarquinhos10@hotmail.com",
  "markueze55@gmail.com",
  "markueze05teste@gmail.com",
  "testando@gmail.com",
  "testemarcos01@gmail.com",
];

async function requireAdmin() {
  const supabase = await createClient();
  const admin = createSupabaseAdminClient() as any;
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user?.id) {
    return { ok: false as const, response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 }) };
  }

  return { ok: true as const, admin };
}

function normalizeEmail(email: unknown) {
  return String(email ?? "").trim().toLowerCase();
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { data, error } = await guard.admin
    .from("legacy_members")
    .select("id,email,display_name,legacy_plan_slug,legacy_status,migrated,password_created")
    .in("email", TEST_EMAILS)
    .order("email", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ testUsers: data ?? [], safeEmails: TEST_EMAILS });
}

export async function DELETE(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const requestedEmails = Array.isArray(body.emails) ? body.emails.map(normalizeEmail) : TEST_EMAILS;
  const allowedEmails = requestedEmails.filter((email: string) => TEST_EMAILS.includes(email));

  if (allowedEmails.length === 0) {
    return NextResponse.json({ removed: [], skipped: [], message: "Nenhum e-mail permitido para limpeza foi informado." });
  }

  const { data: candidates, error: lookupError } = await guard.admin
    .from("legacy_members")
    .select("id,email,display_name,password_created,migrated")
    .in("email", allowedEmails);

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });

  const removable = (candidates ?? []).filter((user: any) => !user.password_created).map((user: any) => user.email);
  const skipped = (candidates ?? [])
    .filter((user: any) => user.password_created)
    .map((user: any) => ({ email: user.email, reason: "Usuário já criou senha. Não removido automaticamente." }));

  if (removable.length === 0) {
    return NextResponse.json({ removed: [], skipped });
  }

  const { error: deleteError } = await guard.admin.from("legacy_members").delete().in("email", removable);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ removed: removable, skipped });
}
