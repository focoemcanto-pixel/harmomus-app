import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { deleteAdminMember } from "@/lib/admin/delete-member";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();
    if (!current.isAdmin) {
      return NextResponse.json({ error: "Apenas administradores podem excluir membros." }, { status: 403 });
    }

    const { id } = await params;
    const userId = String(id ?? "").trim();
    if (!userId) {
      return NextResponse.json({ error: "Informe o membro que deve ser excluído." }, { status: 400 });
    }

    await deleteAdminMember(userId);
    revalidatePath("/admin/membros");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao excluir membro.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
