import { NextResponse } from "next/server";

import { uploadKitCoverToR2 } from "@/lib/r2/upload";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const slug = String(formData.get("slug") ?? "").trim();
    const context = (String(formData.get("context") ?? "kit-cover") as "kit-cover" | "category-cover" | "banner" | "profile-avatar");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
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
