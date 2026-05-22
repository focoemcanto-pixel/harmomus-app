import { randomUUID } from "crypto";

import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth/current-user";
import type { Database } from "@/types/database";

const BUCKET = "public-assets";
const PREFIX = "home";

export async function POST(req: Request) {
  const context = await getCurrentUser();
  if (!context || context.role !== "admin") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Supabase não configurado para upload." }, { status: 500 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "webp";
  const path = `${PREFIX}/${Date.now()}-${randomUUID()}.${ext}`;
  const supabase = createSupabaseClient<Database>(supabaseUrl, serviceRoleKey);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/webp",
  });

  if (error) {
    return NextResponse.json({ error: `Falha no upload: ${error.message}` }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
