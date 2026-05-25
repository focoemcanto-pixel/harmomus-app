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

    if (error) {
      if (isMissingTessituraColumnError(error.message)) {
        return NextResponse.json({
          success: false,
          migrationRequired: true,
          error: "A análise foi executada, mas as colunas de tessitura ainda não existem no banco. Aplique a migration antes de salvar o resultado.",
          detectedMinMidiNote,
          detectedMaxMidiNote,
          confidence,
        }, { status: 200 });
      }

      throw new Error(error.message);
    }

    return NextResponse.json({
      success: true,
      migrationRequired: false,
      detectedMinMidiNote,
      detectedMaxMidiNote,
      confidence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao salvar tessitura.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function isMissingTessituraColumnError(message: string) {
  return [
    "detected_min_midi_note",
    "detected_max_midi_note",
    "tessitura_confidence",
    "tessitura_source",
    "min_midi_note",
    "max_midi_note",
  ].some((column) => message.includes(column));
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
