import { NextResponse } from "next/server";
import { importMember, type LegacyImportInput } from "@/lib/migration/import-member";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const body = await req.json();
  const rows = (body?.rows ?? []) as LegacyImportInput[];

  const results = [] as Array<{ email: string; status: string; message: string; mode: "stripe" | "manual" }>;
  for (const row of rows) {
    if (!row.email || !row.plan) {
      results.push({ email: row.email ?? "", status: "invalido", message: "Campos obrigatórios ausentes", mode: "manual" });
      continue;
    }

    const imported = await importMember(row);
    results.push({ email: row.email, status: imported.status, message: imported.message, mode: imported.mode });
  }

  return NextResponse.json({ results });
}
