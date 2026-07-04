"use client";

import { useMemo, useRef, useState } from "react";

const NOTE_TO_PC: Record<string, number> = { C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5, "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11 };
const PC_TO_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const NIPES = {
  soprano: { label: "Soprano", min: 60, max: 81, intervals: [4, 3, 7, 5, 8, -3] },
  contralto: { label: "Contralto", min: 55, max: 74, intervals: [-3, -4, -5, 3, 4, -7] },
  tenor: { label: "Tenor", min: 48, max: 67, intervals: [-8, -5, -3, -12, 4] },
} as const;

type Nipe = keyof typeof NIPES;
type NoteEvent = { raw: string; midi: number; duration: number };
type GeneratedNote = NoteEvent & { source: string; chord?: string };

declare global { interface Window { webkitAudioContext?: typeof AudioContext } }

function midiToName(midi: number) { return `${PC_TO_NOTE[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`; }
function freqToMidi(freq: number) { return Math.round(69 + 12 * Math.log2(freq / 440)); }
function parseNote(token: string): NoteEvent | null {
  const match = token.trim().match(/^([A-Ga-g])([#bB]?)(-?\d)?(?::([\d.]+))?$/);
  if (!match) return null;
  const pc = NOTE_TO_PC[`${match[1].toUpperCase()}${match[2] || ""}`.toUpperCase()];
  if (pc === undefined) return null;
  const octave = Number(match[3] ?? 4);
  return { raw: `${PC_TO_NOTE[pc]}${octave}`, midi: (octave + 1) * 12 + pc, duration: Math.max(0.25, Number(match[4] ?? 1)) };
}
function parseMelody(value: string) { return value.split(/[\s,;]+/).map(parseNote).filter(Boolean) as NoteEvent[]; }
function melodyToText(notes: NoteEvent[]) { return notes.map((n) => `${midiToName(n.midi)}:${Math.max(0.5, Math.round(n.duration * 10) / 10)}`).join(" "); }

function parseChordSymbol(symbol: string) {
  const clean = symbol.replace(/\s+/g, "").split("/")[0];
  const match = clean.match(/^([A-Ga-g])([#bB]?)(.*)$/);
  if (!match) return null;
  const root = NOTE_TO_PC[`${match[1].toUpperCase()}${match[2] || ""}`.toUpperCase()];
  if (root === undefined) return null;
  const quality = match[3].toLowerCase();
  const minor = quality.includes("m") && !quality.includes("maj");
  const suspended = quality.includes("4") || quality.includes("sus");
  const major7 = quality.includes("7m") || quality.includes("maj7");
  const pcs = suspended ? [root, root + 5, root + 7] : minor ? [root, root + 3, root + 7] : [root, root + 4, root + 7];
  if (quality.includes("7") || major7) pcs.push(root + (major7 ? 11 : 10));
  return new Set(pcs.map((pc) => ((pc % 12) + 12) % 12));
}
function extractChords(value: string) { return (value.match(/[A-G][#b]?(?:m|maj|dim|aug|sus|add)?\d*(?:M|m)?(?:\/[A-G][#b]?)?/g) || []).slice(0, 64); }
function isScaleTone(midi: number, keyPc: number, mode: "major" | "minor") { const pc = ((midi % 12) + 12) % 12; return (mode === "major" ? MAJOR : MINOR).includes((pc - keyPc + 12) % 12); }
function scoreCandidate(candidate: number, previous: number | null, event: NoteEvent, nipe: Nipe, keyPc: number, mode: "major" | "minor", chord?: Set<number>) {
  const range = NIPES[nipe];
  if (candidate < range.min || candidate > range.max) return -999;
  let score = 0;
  if (chord?.has(((candidate % 12) + 12) % 12)) score += 30; else if (isScaleTone(candidate, keyPc, mode)) score += 14; else score -= 18;
  if (Math.abs(candidate - event.midi) <= 12) score += 8;
  if (previous !== null) score -= Math.abs(candidate - previous) * 1.3;
  if (nipe !== "soprano" && candidate >= event.midi) score -= 10;
  if (nipe === "soprano" && candidate <= event.midi) score -= 10;
  return score;
}
function generatePart(melody: NoteEvent[], key: string, mode: "major" | "minor", nipe: Nipe, chordText: string): GeneratedNote[] {
  const keyPc = NOTE_TO_PC[key.toUpperCase()] ?? 0;
  const chordSymbols = extractChords(chordText);
  let previous: number | null = null;
  return melody.map((event, index) => {
    const chordSymbol = chordSymbols.length ? chordSymbols[Math.min(index, chordSymbols.length - 1)] : undefined;
    const chord = chordSymbol ? parseChordSymbol(chordSymbol) ?? undefined : undefined;
    const candidates = NIPES[nipe].intervals.flatMap((i) => [event.midi + i, event.midi + i + 12, event.midi + i - 12]);
    const best = candidates.map((midi) => ({ midi, score: scoreCandidate(midi, previous, event, nipe, keyPc, mode, chord) })).sort((a, b) => b.score - a.score)[0]?.midi ?? event.midi;
    previous = best;
    return { raw: midiToName(best), midi: best, duration: event.duration, source: event.raw, chord: chordSymbol };
  });
}

function autoCorrelate(buffer: Float32Array, sampleRate: number) {
  let rms = 0;
  for (const v of buffer) rms += v * v;
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.012) return null;
  let bestOffset = -1, bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 900), maxOffset = Math.floor(sampleRate / 70);
  for (let offset = minOffset; offset <= maxOffset; offset++) {
    let correlation = 0;
    for (let i = 0; i < buffer.length - offset; i++) correlation += 1 - Math.abs(buffer[i] - buffer[i + offset]);
    correlation /= buffer.length - offset;
    if (correlation > bestCorrelation) { bestCorrelation = correlation; bestOffset = offset; }
  }
  return bestCorrelation > 0.9 && bestOffset > 0 ? sampleRate / bestOffset : null;
}
async function detectMelodyFromBlob(blob: Blob): Promise<NoteEvent[]> {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("AudioContext indisponível.");
  const ctx = new AudioContextClass();
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  const data = audio.getChannelData(0);
  const sampleRate = audio.sampleRate;
  const windowSize = 2048;
  const hop = Math.floor(sampleRate * 0.09);
  const raw: number[] = [];
  for (let start = 0; start + windowSize < data.length; start += hop) {
    const freq = autoCorrelate(data.slice(start, start + windowSize), sampleRate);
    raw.push(freq ? freqToMidi(freq) : -1);
  }
  const notes: NoteEvent[] = [];
  let current = -1, frames = 0;
  const push = () => { if (current > 0 && frames >= 2) notes.push({ raw: midiToName(current), midi: current, duration: Math.max(0.5, frames * 0.45) }); };
  for (const midi of raw) {
    if (midi > 0 && (current < 0 || Math.abs(midi - current) <= 1)) { current = current < 0 ? midi : Math.round((current * frames + midi) / (frames + 1)); frames++; }
    else { push(); current = midi; frames = midi > 0 ? 1 : 0; }
  }
  push();
  await ctx.close().catch(() => undefined);
  return notes.slice(0, 48);
}
async function playNotes(notes: { midi: number; duration: number }[], wave: OscillatorType) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const ctx = new AudioContextClass();
  let time = ctx.currentTime + 0.05;
  notes.forEach((note) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.18, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + note.duration * 0.42);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(time);
    oscillator.stop(time + note.duration * 0.45);
    time += note.duration * 0.48;
  });
}

export function VoicePartGenerator() {
  const [key, setKey] = useState("A");
  const [mode, setMode] = useState<"major" | "minor">("major");
  const [nipe, setNipe] = useState<Nipe>("contralto");
  const [melodyText, setMelodyText] = useState("");
  const [chords, setChords] = useState("A F#m7 D E4 E");
  const [audioUrl, setAudioUrl] = useState("");
  const [status, setStatus] = useState("Grave o refrão cantando uma melodia limpa, sem playback alto.");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const melody = useMemo(() => parseMelody(melodyText), [melodyText]);
  const generated = useMemo(() => generatePart(melody, key, mode, nipe, chords), [melody, key, mode, nipe, chords]);
  const resultText = generated.map((note) => note.raw).join(" ");

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      setAudioUrl(URL.createObjectURL(blob));
      setStatus("Analisando afinação e convertendo em notas...");
      try {
        const notes = await detectMelodyFromBlob(blob);
        setMelodyText(melodyToText(notes));
        setStatus(notes.length ? "Melodia detectada. Agora escolha o nipe e ouça a segunda voz em piano." : "Não consegui detectar notas claras. Grave mais perto do microfone e sem ruído.");
      } catch { setStatus("Não foi possível analisar o áudio neste navegador."); }
    };
    recorder.start();
    setStatus("Gravando... cante somente o trecho principal.");
  }
  function stopRecording() { recorderRef.current?.stop(); recorderRef.current = null; }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 md:px-8">
      <div className="rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,.22),transparent_35%),linear-gradient(145deg,#070812,#111827)] p-5 shadow-premium md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-gold-200">Beta Harmomus</p>
        <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">Gerador de Nipes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">Grave o trecho da melodia principal. O Harmomus detecta as notas, respeita o tom, o nipe escolhido e toca a segunda voz em piano.</p>
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-[.95fr_1.05fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
            <p className="text-sm text-zinc-200">{status}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={startRecording} className="rounded-xl bg-rose-400 px-4 py-3 text-sm font-bold text-white">● Gravar trecho</button>
              <button type="button" onClick={stopRecording} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white">Parar e gerar</button>
            </div>
            {audioUrl ? <audio className="mt-4 w-full" controls src={audioUrl} /> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-zinc-200">Tom<select value={key} onChange={(e) => setKey(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white outline-none">{Object.keys(NOTE_TO_PC).filter((n) => !n.includes("B") || n === "B").map((note) => <option key={note} value={note}>{note}</option>)}</select></label>
            <label className="text-sm text-zinc-200">Modo<select value={mode} onChange={(e) => setMode(e.target.value as "major" | "minor")} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white outline-none"><option value="major">Maior</option><option value="minor">Menor</option></select></label>
            <label className="text-sm text-zinc-200">Nipe<select value={nipe} onChange={(e) => setNipe(e.target.value as Nipe)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white outline-none">{Object.entries(NIPES).map(([value, data]) => <option key={value} value={value}>{data.label}</option>)}</select></label>
          </div>
          <label className="block text-sm text-zinc-200">Notas detectadas <span className="text-zinc-500">editável</span><textarea value={melodyText} onChange={(e) => setMelodyText(e.target.value)} rows={4} placeholder="Grave sua voz ou digite: A4 B4 C#5" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none placeholder:text-zinc-500" /></label>
          <label className="block text-sm text-zinc-200">Acordes do trecho <span className="text-zinc-500">opcional</span><textarea value={chords} onChange={(e) => setChords(e.target.value)} rows={3} placeholder="Ex: A F#m7 D E4 E" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none placeholder:text-zinc-500" /></label>
        </div>
        <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Resultado em piano</p><h2 className="mt-1 text-2xl font-semibold text-white">{NIPES[nipe].label}</h2></div><div className="flex gap-2"><button type="button" onClick={() => playNotes(melody, "sine")} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">Ouvir melodia</button><button type="button" onClick={() => playNotes(generated, "triangle")} className="rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-3 text-sm font-bold text-slate-950">Ouvir nipe</button></div></div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-xs text-zinc-400">Notas geradas</p><p className="mt-2 break-words font-mono text-lg leading-8 text-white">{resultText || "Grave sua voz para gerar."}</p></div>
          <div className="mt-4 grid gap-2">{generated.map((note, index) => <div key={`${note.raw}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm"><span className="text-zinc-300">{index + 1}. Melodia <strong className="text-white">{note.source}</strong>{note.chord ? <> · acorde <strong className="text-cyan-100">{note.chord}</strong></> : null}</span><strong className="text-gold-200">{note.raw}</strong></div>)}</div>
        </div>
      </div>
    </section>
  );
}
