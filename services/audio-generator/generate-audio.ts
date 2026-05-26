import { spawn } from "node:child_process";

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed: ${code}`))));
  });
}

export async function mp3ToWav(inputMp3: string, outputWav: string) {
  await runCommand("ffmpeg", ["-y", "-i", inputMp3, outputWav]);
}

export async function generateAudioWithRubberBand(inputWav: string, outputWav: string, semitoneShift: number) {
  const ratio = 2 ** (semitoneShift / 12);

  await runCommand("rubberband", [
    "--fine",
    "--formant",
    "--pitch-quality",
    "--threads",
    "--timemap-stretch",
    "--pitch",
    String(ratio),
    inputWav,
    outputWav,
  ]);
}

export async function wavToMp3(inputWav: string, outputMp3: string) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputWav,
    "-codec:a",
    "libmp3lame",
    "-qscale:a",
    "2",
    outputMp3,
  ]);
}
