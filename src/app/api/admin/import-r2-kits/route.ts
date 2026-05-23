import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { importR2Kits } from "@/lib/admin/import-r2-kits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest) {
    return Response.json({ error: "Faça login para continuar." }, { status: 401 });
  }

  if (!context.isAdmin) {
    return Response.json({ error: "Apenas administradores podem sincronizar o bucket." }, { status: 403 });
  }

  try {
    const result = await importR2Kits();
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ error: error?.message ?? "Erro ao importar kits do R2." }, { status: 500 });
  }
}
