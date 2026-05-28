import json
import sys

import librosa
import numpy as np


def main() -> None:
    source_path = sys.argv[1]
    mode = sys.argv[2] if len(sys.argv) > 2 else "pyin"
    audio, sample_rate = librosa.load(source_path, sr=None, mono=False)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=0)
    hop_length = 256
    frame_length = 2048
    if mode == "yin":
        f0 = librosa.yin(
            audio,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sample_rate,
            frame_length=frame_length,
            hop_length=hop_length,
        )
        voiced_flag = None
        voiced_prob = None
    else:
        f0, voiced_flag, voiced_prob = librosa.pyin(
            audio,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sample_rate,
            frame_length=frame_length,
            hop_length=hop_length,
        )
    times = librosa.times_like(f0, sr=sample_rate, hop_length=hop_length)

    notes = []
    for index, hz in enumerate(f0):
        if hz is None or np.isnan(hz):
            continue
        midi = int(round(librosa.hz_to_midi(hz)))
        if voiced_prob is not None and voiced_prob[index] is not None and not np.isnan(voiced_prob[index]):
            confidence = float(voiced_prob[index])
        elif voiced_flag is not None:
            confidence = 1.0 if bool(voiced_flag[index]) else 0.0
        else:
            confidence = 0.0
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
