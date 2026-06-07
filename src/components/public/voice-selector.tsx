"use client";

import type { VoiceType } from "@/lib/data/public-kits";

const VOICES: VoiceType[] = ["todos", "tenor", "contralto", "soprano"];

const VOICE_LABELS: Record<VoiceType, string> = {
  todos: "Todos",
  tenor: "Tenor",
  contralto: "Contralto",
  soprano: "Soprano / Barítono",
};

interface VoiceSelectorProps {
  selectedVoice?: VoiceType;
  onSelectVoice?: (voice: VoiceType) => void;
  selected?: VoiceType;
  onChange?: (voice: VoiceType) => void;
}

export function VoiceSelector({ selectedVoice, onSelectVoice, selected, onChange }: VoiceSelectorProps) {
  const currentVoice = selectedVoice ?? selected ?? "todos";
  const handleSelectVoice = onSelectVoice ?? onChange ?? (() => undefined);

  return (
    <div className="flex flex-wrap gap-2">
      {VOICES.map((voice) => {
        const isActive = currentVoice === voice;
        return (
          <button
            key={voice}
            type="button"
            onClick={() => handleSelectVoice(voice)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              isActive ? "border-blue-300 bg-blue-300/15 text-blue-100" : "border-white/20 bg-white/5 text-zinc-200"
            }`}
          >
            {VOICE_LABELS[voice]}
          </button>
        );
      })}
    </div>
  );
}
