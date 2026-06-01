import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { canSubmitPremiumRequests } from "@/lib/auth/ministry-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_TEXT = 120;
const MAX_NOTES = 1000;
const ALLOWED_REQUEST_TYPES = ["song", "tone", "feedback"] as const;

function clean(value: unknown, max = MAX_TEXT) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanUrl(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();

    if (context.isGuest || !context.profile?.id) {
      return NextResponse.json({ error: "Faça login para enviar solicitações." }, { status: 401 });
    }

    if (!canSubmitPremiumRequests(context)) {
      return NextResponse.json(
        { error: "No plano ministerial, apenas o responsável pode solicitar novas músicas, novos tons e feedbacks." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const requestType = clean(body?.request_type, 20);
    const songName = clean(body?.song_name);
    const desiredTone = clean(body?.desired_tone, 40);

    if (!ALLOWED_REQUEST_TYPES.includes(requestType as any)) {
      return NextResponse.json({ error: "Tipo de solicitação inválido." }, { status: 400 });
    }

    if (!songName) {
      return NextResponse.json({ error: requestType === "feedback" ? "Informe o assunto do feedback." : "Informe o nome da música." }, { status: 400 });
    }

    if (requestType === "tone" && !desiredTone) {
      return NextResponse.json({ error: "Informe o tom desejado." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient() as any;

    const { error } = await admin.from("premium_requests").insert({
      user_id: context.profile.id,
      ministry_id: context.ministry?.ministryId ?? null,
      request_type: requestType,
      song_name: songName,
      artist_name: requestType === "feedback" ? "Feedback do usuário" : clean(body?.artist_name) || null,
      reference_link: cleanUrl(body?.reference_link),
      kit_slug: clean(body?.kit_slug, 100) || null,
      desired_tone: requestType === "tone" ? desiredTone || null : null,
      voice_part: requestType === "tone" ? clean(body?.voice_part, 80) || null : null,
      notes: clean(body?.notes, MAX_NOTES) || null,
      status: "pending",
    });

    if (error) {
      return NextResponse.json({ error: error.message || "Não foi possível registrar a solicitação." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao registrar solicitação.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
