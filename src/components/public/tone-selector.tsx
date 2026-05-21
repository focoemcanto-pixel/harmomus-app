"use client";

interface ToneSelectorProps {
  tones: string[];
  selectedTone: string;
  lockedToneSet: Set<string>;
  onSelectTone: (tone: string) => void;
}

export function ToneSelector({ tones, selectedTone, lockedToneSet, onSelectTone }: ToneSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tones.map((tone) => {
        const selected = tone === selectedTone;
        const locked = lockedToneSet.has(tone);
        return (
          <button
            key={tone}
            type="button"
            onClick={() => onSelectTone(tone)}
            className={`rounded-full border px-4 py-1.5 text-sm transition ${
              selected
                ? "border-gold-400 bg-gold-500/15 text-gold-300"
                : "border-white/20 bg-white/5 text-white hover:border-gold-400/50"
            }`}
          >
            {tone} {locked ? "🔒" : ""}
          </button>
        );
      })}
    </div>
  );
}
