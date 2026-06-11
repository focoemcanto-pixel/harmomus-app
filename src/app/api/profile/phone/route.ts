import { NextResponse } from "next/server";

import { normalizePhoneInternational } from "@/lib/communications/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function isValidBrazilPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user?.id) {
    return NextResponse.json({ error: "Faça login para atualizar seu telefone." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const rawPhone = String(body?.phone ?? "").trim();
  const phone = normalizePhoneInternational(rawPhone);

  if (!isValidBrazilPhone(phone)) {
    return NextResponse.json({ error: "Informe um WhatsApp válido com DDD." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient() as any;
  const now = new Date().toISOString();

  const { error: profileError } = await admin
    .from("profiles")
    .update({ phone, updated_at: now })
    .eq("id", authData.user.id);

  if (profileError) {
    return NextResponse.json({ error: profileError.message || "Não foi possível atualizar seu telefone." }, { status: 500 });
  }

  try {
    const currentMetadata = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(authData.user.id, {
      user_metadata: {
        ...currentMetadata,
        phone,
        whatsapp: phone,
      },
    });
  } catch (error) {
    console.warn("[profile.phone] telefone salvo no profile, mas não foi possível atualizar auth metadata", error);
  }

  return NextResponse.json({ success: true, phone });
}
