import { midiToBrazilianNoteName } from "@/lib/music/brazilian-note";

type VoiceKey = "tenor" | "contralto" | "soprano";

type ManualRange = {
  min_midi?: number | null;
  max_midi?: number | null;
};

const VOICES: Array<{ key: VoiceKey; label: string; helper: string }> = [
  { key: "tenor", label: "Tenor", helper: "Ex: A1 → G3" },
  { key: "contralto", label: "Contralto", helper: "Ex: E2 → C4" },
  { key: "soprano", label: "Soprano", helper: "Ex: A2 → E4" },
];

function normalizeRanges(ranges: unknown) {
  if (typeof ranges === "string") {
    try {
      return JSON.parse(ranges) as unknown;
    } catch {
      return null;
    }
  }
  return ranges;
}

function getRangeValue(ranges: unknown, voice: VoiceKey, side: "min" | "max") {
  const normalizedRanges = normalizeRanges(ranges);
  if (!normalizedRanges || typeof normalizedRanges !== "object") return "";
  const value = (normalizedRanges as Record<string, ManualRange>)[voice]?.[side === "min" ? "min_midi" : "max_midi"];
  return typeof value === "number" ? midiToBrazilianNoteName(value) : "";
}

export function ManualTessituraFields({ ranges }: { ranges?: unknown }) {
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 md:col-span-2">
      <div className="mb-4">
        <p className="text-sm font-medium text-emerald-100">Tessitura oficial do tom original</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Preencha em notação brasileira. Exemplo: C3 brasileiro será salvo internamente como C4 internacional/MIDI.
          Esses valores serão transpostos matematicamente para os outros tons e usados nas recomendações públicas.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {VOICES.map((voice) => (
          <div key={voice.key} className="rounded-2xl border border-border bg-surface-muted p-4">
            <p className="text-sm font-semibold text-foreground">{voice.label}</p>
            <p className="mt-1 text-xs text-muted">{voice.helper}</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted">
                Nota mínima
                <input
                  name={`manual_tessitura_${voice.key}_min`}
                  defaultValue={getRangeValue(ranges, voice.key, "min")}
                  placeholder="A1"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none ring-emerald-400/30 focus:ring"
                />
              </label>
              <label className="space-y-1 text-xs text-muted">
                Nota máxima
                <input
                  name={`manual_tessitura_${voice.key}_max`}
                  defaultValue={getRangeValue(ranges, voice.key, "max")}
                  placeholder="G3"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none ring-emerald-400/30 focus:ring"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
