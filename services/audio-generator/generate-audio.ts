import { spawn } from "node:child_process";

export type AudioMetrics = {
  sampleRate: number | null;
  bitrateKbps: number | null;
  loudnessI: number | null;
};

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

function runCommandCapture(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += String(chunk ?? "");
    });

    child.stderr.on("data", (chunk) => {
      output += String(chunk ?? "");
    });

    child.once("error", (error) => reject(error));
    child.once("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} failed: ${code}\n${output}`));
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
  await runCommand("ffmpeg", ["-y", "-i", inputMp3, "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le", outputWav]);
}

export async function generateAudioWithRubberBand(inputWav: string, outputWav: string, semitoneShift: number) {
  if (Math.abs(semitoneShift) > 2) {
    throw new Error(`Semitone shift out of allowed range (±2): ${semitoneShift}`);
  }

  const ratio = 2 ** (semitoneShift / 12);

  const usedRubberbandCli = await tryCommand("rubberband", [
    "--fine",
    "--formant",
    "--pitch-hq",
    "--window-long",
    "--channels-together",
    "--smoothing",
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
    `rubberband=pitch=${ratio}:formant=preserved:transients=crisp:window=long:channels=together`,
    "-ar",
    "48000",
    "-c:a",
    "pcm_f32le",
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
    `asetrate=${sampleRate}*${ratio},aresample=${sampleRate},atempo=${tempo},alimiter=limit=0.95`,
    "-c:a",
    "pcm_f32le",
    outputWav,
  ]);
}

export async function wavToMp3(inputWav: string, outputMp3: string) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputWav,
    "-af",
    "loudnorm=I=-14:TP=-1.0:LRA=11,alimiter=limit=0.98",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "320k",
    outputMp3,
  ]);
}

export async function collectAudioMetrics(inputAudio: string): Promise<AudioMetrics> {
  const ffprobeOutput = await runCommandCapture("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-show_entries",
    "stream=sample_rate,bit_rate",
    "-of",
    "default=noprint_wrappers=1:nokey=0",
    inputAudio,
  ]);

  const srMatch = ffprobeOutput.match(/sample_rate=(\d+)/);
  const brMatch = ffprobeOutput.match(/bit_rate=(\d+)/);

  const loudnormOutput = await runCommandCapture("ffmpeg", [
    "-hide_banner",
    "-i",
    inputAudio,
    "-af",
    "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=summary",
    "-f",
    "null",
    "-",
  ]);

  const inputIMatch = loudnormOutput.match(/Input Integrated:\s*(-?\d+(?:\.\d+)?)\s*LUFS/i);

  return {
    sampleRate: srMatch ? Number(srMatch[1]) : null,
    bitrateKbps: brMatch ? Math.round(Number(brMatch[1]) / 1000) : null,
    loudnessI: inputIMatch ? Number(inputIMatch[1]) : null,
  };
}
