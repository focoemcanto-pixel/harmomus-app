import { revalidatePath } from "next/cache";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { uploadKitAudioBundle, type UploadedKitAudioInput } from "@/lib/admin/upload-kit-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const current = await getCurrentUserAccessContext();

    if (current.isGuest) {
      return Response.json({ error: "Faça login para continuar." }, { status: 401 });
    }

    if (!current.isAdmin) {
      return Response.json({ error: "Apenas administradores podem importar kits." }, { status: 403 });
    }

    const formData = await request.formData();
    const rawFiles = formData.getAll("files");
    const relativePaths = formData.getAll("relativePaths").map((value) => String(value ?? ""));
    const name = String(formData.get("name") ?? "").trim();
    const artist = String(formData.get("artist") ?? "").trim();
    const published = String(formData.get("published") ?? "") === "true";

    const files: UploadedKitAudioInput[] = rawFiles
      .map((file, index) => {
        if (!(file instanceof File)) return null;
        return {
          file,
          relativePath: relativePaths[index] || file.name,
        };
      })
      .filter(Boolean) as UploadedKitAudioInput[];

    if (!files.length) {
      return Response.json({ error: "Nenhum arquivo válido foi enviado." }, { status: 400 });
    }

    const result = await uploadKitAudioBundle({
      files,
      name: name || null,
      artist: artist || null,
      published,
    });

    revalidatePath("/admin/kits");
    revalidatePath(result.editUrl);
    revalidatePath("/biblioteca");
    revalidatePath("/todos-os-kits");

    return Response.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao importar kit.";
    return Response.json({ error: message }, { status: 500 });
  }
}
