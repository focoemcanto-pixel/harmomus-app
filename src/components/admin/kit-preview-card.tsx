"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type PreviewAudioFile = {
  id: string;
  name: string | null;
  tone: string | null;
  file_type: string | null;
};

type KitPreviewCardProps = {
  audioFiles: PreviewAudioFile[];
  initialAudioFileId?: string | null;
  initialStartSeconds?: number | null;
  initialDurationSeconds?: number | null;
  action: (formData: FormData) => Promise<void>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function resolveAudioLabel(file: PreviewAudioFile) {
  const parts = [file.tone, file.name].filter(Boolean);
  return parts.length ? parts.join(" • ") : "Arquivo de áudio";
}

function buildBars(seed: string) {
  const source = seed || "harmomus-preview";
  return Array.from({ length: 72 }, (_, index) => {
    const code = source.charCodeAt(index % source.length) || 7;
    const value = Math.sin((index + 1) * 0.65) * 24 + Math.cos((code + index) * 0.29) * 18 + 48;
    return clamp(Math.round(value), 18, 92);
  });
}

export function KitPreviewCard({ audioFiles, initialAudioFileId, initialStartSeconds, initialDurationSeconds, action }: KitPreviewCardProps) {
  const fallbackFile = audioFiles.find((file) => String(file.name ?? "").toLowerCase().includes("todos")) ?? audioFiles[0] ?? null;
  const [audioFileId, setAudioFileId] = useState(initialAudioFileId || fallbackFile?.id || "");
  const [startSeconds, setStartSeconds] = useState(Math.max(0, Number(initialStartSeconds ?? 0) || 0));
  const [durationSeconds, setDurationSeconds] = useState(clamp(Number(initialDurationSeconds ?? 10) || 10, 3, 30));
  const [audioDuration, setAudioDuration] = useState(180);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const selectedFile = audioFiles.find((file) => file.id === audioFileId) ?? fallbackFile;
  const bars = useMemo(() => buildBars(audioFileId), [audioFileId]);
  const maxStart = Math.max(0, audioDuration - durationSeconds);
  const startPercent = maxStart > 0 ? (startSeconds / maxStart) * 100 : 0;

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  function clearPreviewTimer() {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
  }

  function stopPreview() {
    clearPreviewTimer();
    if (audioRef.current) audioRef.current.pause();
    setIsPlaying(false);
  }

  function setStartFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = scrubberRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nextStart = Math.round(ratio * maxStart);
    setStartSeconds(nextStart);
    if (audioRef.current) audioRef.current.currentTime = nextStart;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setStartFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setStartFromPointer(event);
  }

  async function playPreview() {
    const audio = audioRef.current;
    if (!audio || !audioFileId) return;

    clearPreviewTimer();
    audio.pause();

    const safeStart = Math.max(0, Math.min(startSeconds, Math.max(0, audioDuration - 1)));
    audio.currentTime = safeStart;
    setIsPlaying(true);

    await audio.play().catch(() => {
      setIsPlaying(false);
    });

    stopTimerRef.current = window.setTimeout(() => {
      audio.pause();
      audio.currentTime = safeStart;
      setIsPlaying(false);
      stopTimerRef.current = null;
    }, durationSeconds * 1000);
  }

  return (
    <section className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-5 shadow-premium">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-cyan-100">Preview do kit</p>
          <p className="mt-1 text-xs text-muted">Escolha o áudio e arraste o marcador para definir o trecho que aparece nas capas da Home.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">10s premium</span>
      </div>

      {audioFiles.length ? (
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="preview_audio_file_id" value={audioFileId} />
          <input type="hidden" name="preview_start_seconds" value={String(Math.round(startSeconds))} />
          <input type="hidden" name="preview_duration_seconds" value={String(durationSeconds)} />

          <label className="block space-y-2 text-sm">
            <span className="text-muted">Arquivo do preview</span>
            <select value={audioFileId} onChange={(event) => { stopPreview(); setAudioFileId(event.target.value); setStartSeconds(0); }} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground">
              {audioFiles.map((file) => <option key={file.id} value={file.id}>{resolveAudioLabel(file)}</option>)}
            </select>
          </label>

          <audio ref={audioRef} src={audioFileId ? `/api/audio/${audioFileId}` : undefined} preload="metadata" onLoadedMetadata={(event) => setAudioDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 180)} onEnded={() => setIsPlaying(false)} />

          <div>
            <div ref={scrubberRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} className="relative flex h-28 touch-none cursor-ew-resize items-center gap-1 overflow-hidden rounded-2xl border border-white/10 bg-black/35 px-4">
              {bars.map((height, index) => <span key={index} className="flex-1 rounded-full bg-cyan-200/35" style={{ height: `${height}%` }} />)}
              <div className="pointer-events-none absolute inset-y-3 w-1 rounded-full bg-white shadow-[0_0_24px_rgba(34,211,238,0.9)]" style={{ left: `calc(${startPercent}% - 2px)` }} />
              <div className="pointer-events-none absolute bottom-3 rounded-full bg-cyan-300 px-2 py-1 text-[10px] font-bold text-slate-950 shadow-lg" style={{ left: `min(calc(${startPercent}% + 8px), calc(100% - 72px))` }}>{formatTime(startSeconds)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted">
              <span>Início: <strong className="text-cyan-100">{formatTime(startSeconds)}</strong></span>
              <span>Arquivo: <strong className="text-cyan-100">{selectedFile ? resolveAudioLabel(selectedFile) : "—"}</strong></span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="space-y-2 text-sm">
              <span className="text-muted">Duração</span>
              <select value={durationSeconds} onChange={(event) => { stopPreview(); setDurationSeconds(Number(event.target.value)); }} className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-foreground">
                <option value={5}>5 segundos</option>
                <option value={10}>10 segundos</option>
                <option value={15}>15 segundos</option>
                <option value={20}>20 segundos</option>
              </select>
            </label>
            <button type="button" onClick={() => void playPreview()} className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">{isPlaying ? "Reiniciar preview" : "Testar preview"}</button>
            <button type="submit" className="rounded-lg border border-cyan-300/50 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/25">Salvar preview</button>
          </div>
        </form>
      ) : (
        <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-100">Sincronize os áudios do kit antes de definir o preview.</div>
      )}
    </section>
  );
}
