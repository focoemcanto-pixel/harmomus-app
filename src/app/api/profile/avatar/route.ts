import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { uploadKitCoverToR2 } from "@/lib/r2/upload";

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });

    const uploaded = await uploadKitCoverToR2({ file, slug: context.profile.id, context: "profile-avatar" });
    const supabase = await createClient();
    await (supabase as any).from("profiles").update({ avatar_url: uploaded.url, updated_at: new Date().toISOString() }).eq("id", context.profile.id);

    return NextResponse.json({ success: true, url: uploaded.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
