import { NextResponse } from "next/server";
import { importStripeMember, type LegacyImportInput } from "@/lib/migration/import-member";

export async function POST(req: Request) {
  const body = await req.json();
  const rows = (body?.rows ?? []) as LegacyImportInput[];

  const results = [] as Array<{ email: string; status: string; message: string }>;
  for (const row of rows) {
    if (!row.email || !row.plan || !row.stripe_customer_id || !row.stripe_subscription_id) {
      results.push({ email: row.email ?? "", status: "invalido", message: "Campos obrigatórios ausentes" });
      continue;
    }

    const imported = await importStripeMember(row);
    results.push({ email: row.email, status: imported.status, message: imported.message });
  }

  return NextResponse.json({ results });
}
