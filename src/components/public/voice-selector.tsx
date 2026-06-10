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
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      {VOICES.map((voice) => {
        const isActive = currentVoice === voice;
        return (
          <button
            key={voice}
            type="button"
            onClick={() => handleSelectVoice(voice)}
            className={`min-h-12 rounded-xl border px-3 py-2 text-center text-sm font-medium leading-tight transition sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 ${
              isActive ? "border-blue-300 bg-blue-300/15 text-blue-100 shadow-[0_0_18px_rgba(147,197,253,0.08)]" : "border-white/20 bg-white/5 text-zinc-200 hover:bg-white/10"
            }`}
          >
            {VOICE_LABELS[voice]}
          </button>
        );
      })}
    </div>
  );
}
