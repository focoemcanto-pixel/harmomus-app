"use client";

import { useMemo, useState } from "react";

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

function parseNote(token: string): NoteEvent | null {
  const match = token.trim().match(/^([A-Ga-g])([#bB]?)(-?\d)?(?:(\:)([\d.]+))?$/);
  if (!match) return null;
  const name = `${match[1].toUpperCase()}${match[2] || ""}`.toUpperCase();
  const pc = NOTE_TO_PC[name];
  if (pc === undefined) return null;
  const octave = Number(match[3] ?? 4);
  const duration = Math.max(0.25, Number(match[5] ?? 1));
  return { raw: `${PC_TO_NOTE[pc]}${octave}`, midi: (octave + 1) * 12 + pc, duration };
}

function noteName(midi: number) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${PC_TO_NOTE[pc]}${octave}`;
}

function parseMelody(value: string) {
  return value.split(/[\s,;]+/).map(parseNote).filter(Boolean) as NoteEvent[];
}

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

function extractChords(value: string) {
  const matches = value.match(/[A-G][#b]?(?:m|maj|dim|aug|sus|add)?\d*(?:M|m)?(?:\/[A-G][#b]?)?/g) || [];
  return matches.slice(0, 64);
}

function isScaleTone(midi: number, keyPc: number, mode: "major" | "minor") {
  const pc = ((midi % 12) + 12) % 12;
  const scale = mode === "major" ? MAJOR : MINOR;
  return scale.includes((pc - keyPc + 12) % 12);
}

function scoreCandidate(candidate: number, previous: number | null, event: NoteEvent, nipe: Nipe, keyPc: number, mode: "major" | "minor", chord?: Set<number>) {
  const range = NIPES[nipe];
  if (candidate < range.min || candidate > range.max) return -999;
  let score = 0;
  if (chord?.has(((candidate % 12) + 12) % 12)) score += 30;
  else if (isScaleTone(candidate, keyPc, mode)) score += 14;
  else score -= 18;
  const distance = Math.abs(candidate - event.midi);
  if (distance <= 12) score += 8;
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
    const candidates: number[] = [];

    for (const interval of NIPES[nipe].intervals) {
      candidates.push(event.midi + interval, event.midi + interval + 12, event.midi + interval - 12);
    }

    const best = candidates
      .map((midi) => ({ midi, score: scoreCandidate(midi, previous, event, nipe, keyPc, mode, chord) }))
      .sort((a, b) => b.score - a.score)[0]?.midi ?? event.midi;

    previous = best;
    return { raw: noteName(best), midi: best, duration: event.duration, source: event.raw, chord: chordSymbol };
  });
}

async function playNotes(notes: { midi: number; duration: number }[], wave: OscillatorType) {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
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
  const [melodyText, setMelodyText] = useState("A4 B4 C#5 B4 A4 F#4 A4 B4 A4 G#4 E4");
  const [chords, setChords] = useState("A F#m7 D E4 E");
  const melody = useMemo(() => parseMelody(melodyText), [melodyText]);
  const generated = useMemo(() => generatePart(melody, key, mode, nipe, chords), [melody, key, mode, nipe, chords]);
  const resultText = generated.map((note) => note.raw).join(" ");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 md:px-8">
      <div className="overflow-hidden rounded-[2rem] border border-white/15 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,.22),transparent_35%),linear-gradient(145deg,#070812,#111827)] p-5 shadow-premium md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-gold-200">Beta Harmomus</p>
        <h1 className="mt-3 text-3xl font-semibold text-white md:text-5xl">Gerador de Nipes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300 md:text-base">Teste uma segunda voz padrão por nipe. Informe o tom, escolha soprano, contralto ou tenor e cole a melodia em notas. Se a música tiver harmonia mais trabalhada, cole também a sequência de acordes.</p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[.95fr_1.05fr]">
        <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm text-zinc-200">Tom
              <select value={key} onChange={(e) => setKey(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white outline-none">
                {Object.keys(NOTE_TO_PC).filter((n) => !n.includes("B") || n === "B").map((note) => <option key={note} value={note}>{note}</option>)}
              </select>
            </label>
            <label className="text-sm text-zinc-200">Modo
              <select value={mode} onChange={(e) => setMode(e.target.value as "major" | "minor")} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white outline-none">
                <option value="major">Maior</option><option value="minor">Menor</option>
              </select>
            </label>
            <label className="text-sm text-zinc-200">Nipe
              <select value={nipe} onChange={(e) => setNipe(e.target.value as Nipe)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-white outline-none">
                {Object.entries(NIPES).map(([value, data]) => <option key={value} value={value}>{data.label}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-sm text-zinc-200">Melodia principal
            <textarea value={melodyText} onChange={(e) => setMelodyText(e.target.value)} rows={5} placeholder="Ex: A4 B4 C#5 B4 A4" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none placeholder:text-zinc-500" />
          </label>

          <label className="block text-sm text-zinc-200">Acordes do trecho <span className="text-zinc-500">opcional</span>
            <textarea value={chords} onChange={(e) => setChords(e.target.value)} rows={4} placeholder="Ex: A F#m7 D E4 E" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none placeholder:text-zinc-500" />
          </label>
        </div>

        <div className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Resultado</p><h2 className="mt-1 text-2xl font-semibold text-white">{NIPES[nipe].label}</h2></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => playNotes(melody, "sine")} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10">Ouvir melodia</button>
              <button type="button" onClick={() => playNotes(generated, "triangle")} className="rounded-xl bg-gradient-to-r from-cyan-300 to-fuchsia-300 px-4 py-3 text-sm font-bold text-slate-950">Ouvir nipe</button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs text-zinc-400">Notas geradas</p>
            <p className="mt-2 break-words font-mono text-lg leading-8 text-white">{resultText || "Cole a melodia para gerar."}</p>
          </div>

          <div className="mt-4 grid gap-2">
            {generated.map((note, index) => (
              <div key={`${note.raw}-${index}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
                <span className="text-zinc-300">{index + 1}. Melodia <strong className="text-white">{note.source}</strong>{note.chord ? <> · acorde <strong className="text-cyan-100">{note.chord}</strong></> : null}</span>
                <strong className="text-gold-200">{note.raw}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
