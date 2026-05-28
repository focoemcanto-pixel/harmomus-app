import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { canSubmitPremiumRequests } from "@/lib/auth/ministry-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  const context = await getCurrentUserAccessContext();

  if (context.isGuest || !context.profile?.id) {
    return NextResponse.json({ error: "Faça login para enviar solicitações." }, { status: 401 });
  }

  if (!canSubmitPremiumRequests(context)) {
    return NextResponse.json(
      { error: "No plano ministerial, apenas o responsável pode solicitar novas músicas e novos tons." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const requestType = clean(body?.request_type);
  const songName = clean(body?.song_name);

  if (!["song", "tone"].includes(requestType)) {
    return NextResponse.json({ error: "Tipo de solicitação inválido." }, { status: 400 });
  }

  if (!songName) {
    return NextResponse.json({ error: "Informe o nome da música." }, { status: 400 });
  }

  if (requestType === "tone" && !clean(body?.desired_tone)) {
    return NextResponse.json({ error: "Informe o tom desejado." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient() as any;

  const { error } = await admin.from("premium_requests").insert({
    user_id: context.profile.id,
    ministry_id: context.ministry?.ministryId ?? null,
    request_type: requestType,
    song_name: songName,
    artist_name: clean(body?.artist_name) || null,
    reference_link: clean(body?.reference_link) || null,
    kit_slug: clean(body?.kit_slug) || null,
    desired_tone: clean(body?.desired_tone) || null,
    voice_part: clean(body?.voice_part) || null,
    notes: clean(body?.notes) || null,
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message || "Não foi possível registrar a solicitação." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
