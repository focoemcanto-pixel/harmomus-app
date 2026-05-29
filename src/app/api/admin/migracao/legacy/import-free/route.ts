import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type LegacyFreeRow = {
  email?: string;
  name?: string;
  plan?: string;
  status?: string;
};

type ImportStatus = "novo" | "existente" | "atualizado" | "invalido" | "conflito";

type ImportResult = {
  email: string;
  status: ImportStatus;
  message: string;
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizePlan(value: unknown) {
  const plan = String(value ?? "free").trim().toLowerCase();
  return plan || "free";
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "active").trim().toLowerCase();
  return status || "active";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json().catch(() => ({}));
    const rows = Array.isArray(body.rows) ? (body.rows as LegacyFreeRow[]) : [];
    const dryRun = Boolean(body.dryRun);

    if (rows.length === 0) {
      return NextResponse.json({ results: [], summary: { total: 0, valid: 0, invalid: 0 } });
    }

    const admin = guard.admin;
    const seen = new Set<string>();
    const results: ImportResult[] = [];

    for (const row of rows) {
      const email = normalizeEmail(row.email);
      const name = String(row.name ?? "").trim();
      const plan = normalizePlan(row.plan);
      const status = normalizeStatus(row.status);

      if (!isValidEmail(email)) {
        results.push({ email: email || "(sem e-mail)", status: "invalido", message: "E-mail inválido." });
        continue;
      }

      if (seen.has(email)) {
        results.push({ email, status: "conflito", message: "E-mail duplicado no CSV." });
        continue;
      }
      seen.add(email);

      if (plan !== "free") {
        results.push({ email, status: "invalido", message: "Esta importação aceita somente usuários Free." });
        continue;
      }

      if (status !== "active") {
        results.push({ email, status: "invalido", message: "Esta importação aceita somente usuários Free ativos." });
        continue;
      }

      const { data: existing, error: lookupError } = await admin
        .from("legacy_members")
        .select("id,email,display_name,legacy_plan_slug,legacy_status,migrated,password_created")
        .ilike("email", email)
        .maybeSingle();

      if (lookupError) {
        results.push({ email, status: "invalido", message: `Erro ao consultar legacy_members: ${lookupError.message}` });
        continue;
      }

      if (existing?.password_created) {
        results.push({ email, status: "existente", message: "Usuário já ativou a conta. Nada será alterado." });
        continue;
      }

      if (dryRun) {
        results.push({
          email,
          status: existing?.id ? "existente" : "novo",
          message: existing?.id ? "Já existe em legacy_members e ainda não ativou senha." : "Será inserido em legacy_members.",
        });
        continue;
      }

      if (existing?.id) {
        const { error: updateError } = await admin
          .from("legacy_members")
          .update({
            display_name: name || existing.display_name || null,
            legacy_plan_slug: "free",
            legacy_status: "active",
          })
          .eq("id", existing.id);

        if (updateError) {
          results.push({ email, status: "invalido", message: `Erro ao atualizar registro legado: ${updateError.message}` });
          continue;
        }

        results.push({ email, status: "atualizado", message: "Registro legado atualizado sem alterar flags de ativação." });
        continue;
      }

      const { error: insertError } = await admin.from("legacy_members").insert({
        email,
        display_name: name || null,
        legacy_plan_slug: "free",
        legacy_status: "active",
        migrated: false,
        password_created: false,
      });

      if (insertError) {
        results.push({ email, status: "invalido", message: `Erro ao inserir registro legado: ${insertError.message}` });
        continue;
      }

      results.push({ email, status: "novo", message: "Inserido em legacy_members." });
    }

    const summary = results.reduce(
      (acc, result) => {
        acc.total += 1;
        acc[result.status] = (acc[result.status] ?? 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>,
    );

    return NextResponse.json({ results, summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado na importação." },
      { status: 500 },
    );
  }
}
