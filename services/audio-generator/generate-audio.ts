import { spawn } from "node:child_process";

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", (error) => {
      reject(error);
    });

    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed: ${code}`));
    });
  });
}

async function tryCommand(command: string, args: string[]) {
  try {
    await runCommand(command, args);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[audio-generator] ${command} unavailable or failed: ${message}`);
    return false;
  }
}

export async function mp3ToWav(inputMp3: string, outputWav: string) {
  await runCommand("ffmpeg", ["-y", "-i", inputMp3, outputWav]);
}

export async function generateAudioWithRubberBand(inputWav: string, outputWav: string, semitoneShift: number) {
  const ratio = 2 ** (semitoneShift / 12);

  const usedRubberbandCli = await tryCommand("rubberband", [
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

  if (usedRubberbandCli) return;

  const usedFfmpegRubberband = await tryCommand("ffmpeg", [
    "-y",
    "-i",
    inputWav,
    "-af",
    `rubberband=pitch=${ratio}`,
    outputWav,
  ]);

  if (usedFfmpegRubberband) return;

  const sampleRate = 48000;
  const tempo = 1 / ratio;

  console.warn("[audio-generator] Falling back to ffmpeg asetrate/atempo pitch shift. For best quality, deploy this service with Docker and rubberband-cli.");

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputWav,
    "-af",
    `asetrate=${sampleRate}*${ratio},aresample=${sampleRate},atempo=${tempo}`,
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
