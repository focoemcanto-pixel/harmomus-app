import json
import sys

import librosa
import numpy as np


MIN_VALID_HZ = 60.0
MAX_VALID_HZ = 1200.0
HOP_LENGTH = 256
FRAME_LENGTH = 2048


def midi_to_note_name(midi: int) -> str:
    names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    note = names[midi % 12]
    octave = (midi // 12) - 1
    return f"{note}{octave}"


def percentile(values: np.ndarray, ratio: float):
    if values.size == 0:
        return None
    return int(round(float(np.percentile(values, ratio * 100))))


def main() -> None:
    source_path = sys.argv[1]
    y, sr = librosa.load(source_path, sr=None, mono=True)

    f0 = librosa.yin(
        y,
        fmin=librosa.note_to_hz("C2"),
        fmax=librosa.note_to_hz("C6"),
        sr=sr,
        frame_length=FRAME_LENGTH,
        hop_length=HOP_LENGTH,
    )

    f0 = f0[np.isfinite(f0)]
    f0 = f0[(f0 > MIN_VALID_HZ) & (f0 < MAX_VALID_HZ)]

    times = librosa.times_like(f0, sr=sr, hop_length=HOP_LENGTH)
    midi_values = np.rint(librosa.hz_to_midi(f0)).astype(int) if f0.size else np.array([], dtype=int)

    notes = []
    for index, midi in enumerate(midi_values):
        start_s = float(times[index]) if index < len(times) else float(index * HOP_LENGTH / sr)
        notes.append(
            {
                "start_s": start_s,
                "end_s": start_s + (HOP_LENGTH / sr),
                "pitch_midi": int(midi),
                "confidence": 0.85,
            }
        )

    dominant_notes = []
    if midi_values.size:
        unique, counts = np.unique(midi_values, return_counts=True)
        order = np.argsort(counts)[::-1][:7]
        dominant_notes = [
            {
                "midi": int(unique[index]),
                "note": midi_to_note_name(int(unique[index])),
                "occurrences": int(counts[index]),
            }
            for index in order
        ]

    print(
        json.dumps(
            {
                "notes": notes,
                "avg_pitch_midi": float(np.mean(midi_values)) if midi_values.size else None,
                "frames": int(len(f0)),
                "voiced_frames": int(len(notes)),
                "detected_min_midi": percentile(midi_values, 0.05),
                "detected_max_midi": percentile(midi_values, 0.95),
                "comfort_min_midi": percentile(midi_values, 0.20),
                "comfort_max_midi": percentile(midi_values, 0.80),
                "dominant_notes": dominant_notes,
            }
        )
    )


if __name__ == "__main__":
    main()
