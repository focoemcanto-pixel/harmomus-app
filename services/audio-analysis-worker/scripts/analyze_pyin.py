import json
import sys

import librosa
import numpy as np


FMIN_HZ = 65.0
FMAX_HZ = 1200.0


def main() -> None:
    source_path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "yin"
    audio, sample_rate = librosa.load(source_path, sr=None, mono=True)

    hop_length = 256
    frame_length = 1024 if mode == "yin" else 2048

    if mode == "pyin":
        f0, voiced_flag, voiced_prob = librosa.pyin(
            audio,
            fmin=FMIN_HZ,
            fmax=FMAX_HZ,
            sr=sample_rate,
            frame_length=frame_length,
            hop_length=hop_length,
        )
    else:
        f0 = librosa.yin(
            audio,
            fmin=FMIN_HZ,
            fmax=FMAX_HZ,
            sr=sample_rate,
            frame_length=frame_length,
            hop_length=hop_length,
        )
        voiced_flag = None
        voiced_prob = None

    times = librosa.times_like(f0, sr=sample_rate, hop_length=hop_length)

    notes = []
    for index, hz in enumerate(f0):
        if hz is None or np.isnan(hz) or hz < FMIN_HZ or hz > FMAX_HZ:
            continue

        midi = int(round(librosa.hz_to_midi(hz)))
        if voiced_prob is not None and voiced_prob[index] is not None and not np.isnan(voiced_prob[index]):
            confidence = float(voiced_prob[index])
        elif voiced_flag is not None:
            confidence = 1.0 if bool(voiced_flag[index]) else 0.0
        else:
            confidence = 0.85

        start_s = float(times[index])
        notes.append(
            {
                "start_s": start_s,
                "end_s": start_s + (hop_length / sample_rate),
                "pitch_midi": midi,
                "confidence": confidence,
            }
        )

    avg_pitch_midi = float(np.mean([note["pitch_midi"] for note in notes])) if notes else None
    print(
        json.dumps(
            {
                "notes": notes,
                "avg_pitch_midi": avg_pitch_midi,
                "frames": int(len(f0)),
                "voiced_frames": int(len(notes)),
            }
        )
    )


if __name__ == "__main__":
    main()
