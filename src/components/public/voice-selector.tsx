"use client";

import type { VoiceType } from "@/lib/data/public-kits";

const VOICES: VoiceType[] = ["todos", "tenor", "contralto", "soprano", "baritono"];

interface VoiceSelectorProps {
  selectedVoice: VoiceType;
  onSelectVoice: (voice: VoiceType) => void;
}

export function VoiceSelector({ selectedVoice, onSelectVoice }: VoiceSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {VOICES.map((voice) => {
        const isActive = selectedVoice === voice;
        return (
          <button
            key={voice}
            type="button"
            onClick={() => onSelectVoice(voice)}
            className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition ${
              isActive ? "border-blue-300 bg-blue-300/15 text-blue-100" : "border-white/20 bg-white/5 text-zinc-200"
            }`}
          >
            {voice}
          </button>
        );
      })}
    </div>
  );
}
