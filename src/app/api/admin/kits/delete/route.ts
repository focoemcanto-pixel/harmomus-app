import { NextResponse } from "next/server";

import { deleteKit } from "@/lib/data/kits";
import { setFlashToast } from "@/lib/flash";

export async function POST(request: Request) {
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  try {
    if (!id) throw new Error("Kit inválido para exclusão.");
    await deleteKit(id);
    await setFlashToast("success", `Kit ${name || "selecionado"} excluído com sucesso.`);
  } catch (error) {
    await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível excluir o kit.");
  }

  return NextResponse.redirect(new URL("/admin/kits", request.url), 303);
}
