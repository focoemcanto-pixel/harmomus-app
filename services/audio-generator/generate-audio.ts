import { spawn } from "node:child_process";

export type AudioMetrics = {
  sampleRate: number | null;
  bitrateKbps: number | null;
  loudnessI: number | null;
};

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    console.info(`[audio-generator] running ${command} ${args.join(" ")}`);
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", (error) => reject(error));
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
    console.warn(`[audio-generator] ${command} unavailable or failed, trying fallback: ${message}`);
    return false;
  }
}

export async function mp3ToWav(inputMp3: string, outputWav: string) {
  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputMp3,
    "-vn",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-sample_fmt",
    "flt",
    "-c:a",
    "pcm_f32le",
    outputWav,
  ]);
}

export async function generateAudioWithRubberBand(inputWav: string, outputWav: string, semitoneShift: number) {
  if (Math.abs(semitoneShift) > 2) {
    throw new Error(`Semitone shift out of allowed range (±2): ${semitoneShift}`);
  }

  const ratio = 2 ** (semitoneShift / 12);

  // Rubber Band CLI versions vary a lot between Linux images. Keep this option set conservative.
  // Invalid HQ flags can make the worker look "dead" because every job fails before producing output.
  const usedRubberbandCli = await tryCommand("rubberband", [
    "--fine",
    "--formant",
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
    `rubberband=pitch=${ratio}:formant=preserved:transients=crisp:window=long` ,
    "-ar",
    "48000",
    "-sample_fmt",
    "flt",
    "-c:a",
    "pcm_f32le",
    outputWav,
  ]);

  if (usedFfmpegRubberband) return;

  const sampleRate = 48000;
  const tempo = 1 / ratio;

  console.warn("[audio-generator] Falling back to ffmpeg asetrate/atempo pitch shift. Install rubberband-cli for best quality.");

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputWav,
    "-af",
    `asetrate=${sampleRate}*${ratio},aresample=${sampleRate},atempo=${tempo},alimiter=limit=0.95`,
    "-sample_fmt",
    "flt",
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
    "alimiter=limit=0.98",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "320k",
    outputMp3,
  ]);
}

export async function collectAudioMetrics(inputAudio: string): Promise<AudioMetrics> {
  try {
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

    return {
      sampleRate: srMatch ? Number(srMatch[1]) : null,
      bitrateKbps: brMatch ? Math.round(Number(brMatch[1]) / 1000) : null,
      loudnessI: null,
    };
  } catch (error) {
    console.warn("[audio-generator] Could not collect audio metrics", error);
    return { sampleRate: null, bitrateKbps: null, loudnessI: null };
  }
}
