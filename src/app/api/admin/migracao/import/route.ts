import { NextResponse } from "next/server";
import { importMember, type LegacyImportInput } from "@/lib/migration/import-member";

export async function POST(req: Request) {
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
