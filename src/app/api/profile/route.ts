import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const fullName = String(body?.full_name ?? "").trim();

    if (!fullName) {
      return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
    }

    if (fullName.length > 80) {
      return NextResponse.json({ error: "Nome muito longo." }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update({ full_name: fullName, updated_at: new Date().toISOString() })
      .eq("id", context.profile.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, full_name: fullName });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
