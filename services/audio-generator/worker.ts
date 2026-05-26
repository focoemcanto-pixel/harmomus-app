import { spawn } from "node:child_process";

export interface AudioGenerationJob {
  inputPath: string;
  shiftedWavPath: string;
  outputMp3Path: string;
  semitoneShift: number;
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} saiu com código ${code ?? -1}`));
    });
  });
}

export async function processAudioGenerationJob(job: AudioGenerationJob) {
  await runCommand("rubberband", ["--pitch", String(job.semitoneShift), job.inputPath, job.shiftedWavPath]);
  await runCommand("ffmpeg", ["-y", "-i", job.shiftedWavPath, "-codec:a", "libmp3lame", "-qscale:a", "2", job.outputMp3Path]);
}
