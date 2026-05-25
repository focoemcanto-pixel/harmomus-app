import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await getCurrentUserAccessContext();

    if (!current.isAdmin) {
      return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
    }

    const body = await request.json();

    const detectedMinMidiNote = normalizeMidi(body.detectedMinMidiNote);
    const detectedMaxMidiNote = normalizeMidi(body.detectedMaxMidiNote);
    const confidence = normalizeConfidence(body.confidence);

    const { id } = await params;
    const supabase = (await createClient()) as any;

    const { error } = await supabase
      .from("kit_audio_files")
      .update({
        detected_min_midi_note: detectedMinMidiNote,
        detected_max_midi_note: detectedMaxMidiNote,
        tessitura_confidence: confidence,
        tessitura_source: "auto",
      })
      .eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      detectedMinMidiNote,
      detectedMaxMidiNote,
      confidence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar tessitura.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function normalizeMidi(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}
