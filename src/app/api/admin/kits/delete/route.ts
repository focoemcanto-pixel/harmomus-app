import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { deleteKit } from "@/lib/data/kits";
import { setFlashToast } from "@/lib/flash";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  let deleted = false;

  try {
    if (!id) throw new Error("Kit inválido para exclusão.");
    await deleteKit(id);
    deleted = true;
    await setFlashToast("success", `Kit ${name || "selecionado"} excluído com sucesso.`);
  } catch (error) {
    console.error("[admin.kits.delete] Falha ao excluir kit", { id, name, error });
    await setFlashToast("error", error instanceof Error ? error.message : "Não foi possível excluir o kit.");
  }

  revalidatePath("/admin/kits");
  revalidatePath("/biblioteca");
  revalidatePath("/todos-os-kits");

  const redirectUrl = new URL("/admin/kits", request.url);
  redirectUrl.searchParams.set("delete", deleted ? "success" : "error");
  return NextResponse.redirect(redirectUrl, 303);
}
