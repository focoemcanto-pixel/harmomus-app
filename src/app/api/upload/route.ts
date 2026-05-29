import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { uploadKitCoverToR2 } from "@/lib/r2/upload";

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_CONTEXTS = new Set(["kit-cover", "category-cover", "banner", "profile-avatar"]);

export async function POST(request: Request) {
  try {
    const current = await getCurrentUserAccessContext();
    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const slug = String(formData.get("slug") ?? "").trim();
    const contextRaw = String(formData.get("context") ?? "kit-cover").trim();
    const context = ALLOWED_CONTEXTS.has(contextRaw) ? contextRaw as "kit-cover" | "category-cover" | "banner" | "profile-avatar" : "kit-cover";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Envie uma imagem JPG, PNG, WEBP ou GIF." }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      return NextResponse.json({ error: "Imagem muito grande. Envie arquivos de até 5MB." }, { status: 400 });
    }

    if (!slug) {
      return NextResponse.json({ error: "Slug é obrigatório para upload." }, { status: 400 });
    }

    const uploaded = await uploadKitCoverToR2({ file, slug, context });

    return NextResponse.json({
      success: true,
      key: uploaded.key,
      url: uploaded.url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao fazer upload.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
