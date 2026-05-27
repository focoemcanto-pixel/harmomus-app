"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeAudioUrlPitch, midiToNoteName } from "@/lib/audio/pitch-analysis";
import { getSignedSemitoneDistance, normalizeTone, sortTonesByChromaticOrder } from "@/lib/music/tones";
import type { KitAudioFile, KitAudioToneGroup } from "@/types/kit-audio";

interface AnalysisSummary {
  total: number;
  analyzed: number;
  saved: number;
  failed: number;
  migrationRequired: boolean;
}

type AudioJob = {
  id: string;
  status: string;
  target_tone: string;
  source_tone?: string | null;
  voice?: string | null;
  semitone_shift?: number | null;
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
};

type AnalysisJob = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | string;
  kit_id: string;
  audio_file_id: string;
  analysis_type: string;
  analysis_logs?: Array<{ message?: string; at?: string }> | null;
  error_message?: string | null;
  detected_min_note?: number | null;
  detected_max_note?: number | null;
  comfort_min_note?: number | null;
  comfort_max_note?: number | null;
  dominant_notes?: Array<{ midi?: number; note?: string; occurrences?: number }> | null;
  vocal_confidence?: number | null;
  pitch_events_json?: { recommended_tones?: Record<string, { min_midi?: number | null; max_midi?: number | null }> } | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const STATUS_STYLES: Record<string, { label: string; icon: string; className: string; dot: string }> = {
  completed: {
    label: "Concluído",
    icon: "✓",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-300",
  },
  processing: {
    label: "Processando",
    icon: "↻",
    className: "border-sky-400/30 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-300 animate-pulse",
  },
  pending: {
    label: "Na fila",
    icon: "…",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-200",
    dot: "bg-amber-300",
  },
  failed: {
    label: "Falhou",
    icon: "!",
    className: "border-red-400/30 bg-red-500/10 text-red-200",
    dot: "bg-red-300",
  },
};

function getStatusMeta(status: string) {
  return STATUS_STYLES[status] ?? {
    label: status,
    icon: "•",
    className: "border-white/10 bg-white/5 text-zinc-300",
    dot: "bg-zinc-400",
  };
}

function formatJobVoice(voice?: string | null) {
  const map: Record<string, string> = {
    todos: "Todos",
    soprano: "Soprano",
    contralto: "Contralto",
    tenor: "Tenor",
  };
  return voice ? map[voice] ?? voice : "Voz";
}

function formatShift(shift?: number | null) {
  if (typeof shift !== "number") return "—";
  if (shift === 0) return "Original";
  return `${shift > 0 ? "+" : ""}${shift} semitom${Math.abs(shift) === 1 ? "" : "s"}`;
}

function formatTime(value?: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return null;
  }
}

export function KitAudioSyncCard({ kitId }: { kitId: string }) {
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [analyzingKey, setAnalyzingKey] = useState<string | null>(null);
  const [analyzingAll, setAnalyzingAll] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tones, setTones] = useState<KitAudioToneGroup[]>([]);
  const [usedPrefix, setUsedPrefix] = useState<string | null>(null);
  const [hasTessituraColumns, setHasTessituraColumns] = useState(true);
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<AudioJob[]>([]);
  const [lastJobRefresh, setLastJobRefresh] = useState<string | null>(null);
  const [analysisJobs, setAnalysisJobs] = useState<AnalysisJob[]>([]);
  const [analysisLoadingFileId, setAnalysisLoadingFileId] = useState<string | null>(null);
  const [analysisSubmitMessage, setAnalysisSubmitMessage] = useState<string | null>(null);
  const [analysisSubmitError, setAnalysisSubmitError] = useState<string | null>(null);

  const VOICE_ORDER = ["todos", "soprano", "contralto", "tenor"] as const;

  const allFiles = useMemo(() => tones.flatMap((tone) => tone.files), [tones]);
  const generatedTones = useMemo(
    () => tones.filter((tone) => (tone as any).generated || tone.files?.some((file: any) => file.generated)),
    [tones],
  );
  const pendingFiles = useMemo(
    () => allFiles.filter((file) => typeof file.id === "string" && (typeof (file.minMidiNote ?? file.detectedMinMidiNote) !== "number" || typeof (file.maxMidiNote ?? file.detectedMaxMidiNote) !== "number")),
    [allFiles],
  );

  const jobStats = useMemo(() => {
    const total = jobs.length;
    const completed = jobs.filter((job) => job.status === "completed").length;
    const processing = jobs.filter((job) => job.status === "processing").length;
    const pending = jobs.filter((job) => job.status === "pending").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, processing, pending, failed, progress };
  }, [jobs]);

  const sortedToneGroups = useMemo(() => {
    const sorted = [...tones].sort((a, b) => (normalizeTone(a.tone) ?? a.tone).localeCompare(normalizeTone(b.tone) ?? b.tone));
    const inferredOriginal = normalizeTone(jobs.find((job) => Boolean(job.source_tone))?.source_tone ?? "") ?? null;
    if (!inferredOriginal) return sorted;

    return [...sorted].sort((a, b) => {
      const aTone = normalizeTone(a.tone);
      const bTone = normalizeTone(b.tone);
      if (!aTone || !bTone) return 0;
      if (aTone === inferredOriginal) return -1;
      if (bTone === inferredOriginal) return 1;
      const aShift = Math.abs(getSignedSemitoneDistance(inferredOriginal, aTone) ?? 99);
      const bShift = Math.abs(getSignedSemitoneDistance(inferredOriginal, bTone) ?? 99);
      if (aShift !== bShift) return aShift - bShift;
      return sortTonesByChromaticOrder([aTone, bTone])[0] === aTone ? -1 : 1;
    });
  }, [tones, jobs]);

  async function loadSyncedAudios() {
    setLoadingFiles(true);
    setError(null);

    try {
      const response = await fetch(`/api/kits/${kitId}/audio-files`, { method: "GET", cache: "no-store" });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error ?? "Não foi possível carregar os áudios sincronizados.");

      setHasTessituraColumns(data?.hasTessituraColumns !== false);
      setTones((data?.tones ?? []) as KitAudioToneGroup[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro inesperado ao carregar áudios.");
      setTones([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    void loadSyncedAudios();
    void loadJobs();
    void loadAnalysisJobs();
  }, [kitId]);

  useEffect(() => {
    if (!jobs.some((job) => job.status === "pending" || job.status === "processing")) return;
    const interval = window.setInterval(() => {
      void loadSyncedAudios();
      void loadJobs();
      void loadAnalysisJobs();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [jobs]);

  async function loadJobs() {
    setJobError(null);
    const response = await fetch(`/api/audio/status?kitId=${kitId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setJobs((data.jobs ?? []) as AudioJob[]);
      setLastJobRefresh(new Date().toISOString());
      if (data?.error) setJobError(String(data.error));
    } else {
      setJobError(data?.error ?? "Falha ao carregar status dos jobs.");
    }
  }

  async function loadAnalysisJobs() {
    const response = await fetch(`/api/audio/analyze?kitId=${kitId}`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setAnalysisJobs((data.jobs ?? []) as AnalysisJob[]);
    }
  }

  async function enqueueAiAnalysisBatch() {
    setAnalyzingAll(true);
    setAnalysisSubmitError(null);
    setAnalysisSubmitMessage("enfileirando análises em massa...");
    try {
      for (const file of pendingFiles) {
        if (!file.id) continue;
        await enqueueAiAnalysis(file.id);
      }
      setAnalysisSubmitMessage("análise em massa enviada");
      await loadAnalysisJobs();
    } finally {
      setAnalyzingAll(false);
    }
  }

  async function enqueueAiAnalysis(audioFileId?: string) {
    if (!audioFileId) return;
    setAnalysisLoadingFileId(audioFileId);
    setAnalysisSubmitMessage("criando análise...");
    setAnalysisSubmitError(null);
    try {
      const response = await fetch("/api/audio/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId, audioFileId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error ?? "erro ao enviar");
      }
      setAnalysisSubmitMessage("análise enviada");
      await loadAnalysisJobs();
    } catch (submitError) {
      setAnalysisSubmitError(submitError instanceof Error ? submitError.message : "erro ao enviar");
    } finally {
      setAnalysisLoadingFileId(null);
    }
  }

  function getAnalysisJobForFile(audioFileId?: string) {
    if (!audioFileId) return null;
    return analysisJobs.find((job) => job.audio_file_id === audioFileId) ?? null;
  }

  async function generateTonesAutomatically() {
    const source = allFiles.find((file) => typeof file.id === "string");
    if (!source?.id) {
      setError("É necessário ter ao menos um áudio sincronizado para gerar tons automaticamente.");
      return;
    }

    setJobLoading(true);
    setError(null);
    try {
      const tonesSet = new Set(tones.map((toneGroup) => toneGroup.tone));
      const chromatic = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
      const targets = chromatic.filter((tone) => !tonesSet.has(tone));
      const voice = source.voice || "todos";

      const response = await fetch(`/api/audio/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitId, targetTones: targets, voice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Falha ao enfileirar jobs.");
      await loadJobs();
      await loadSyncedAudios();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar tons automaticamente.");
    } finally {
      setJobLoading(false);
    }
  }

  async function syncAudios() {
    setLoading(true);
    setError(null);
    setAnalysisSummary(null);
    try {
      const response = await fetch(`/api/kits/${kitId}/sync-audio`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível sincronizar os áudios.");
      setUsedPrefix(typeof data?.usedPrefix === "string" ? data.usedPrefix : null);
      await loadSyncedAudios();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Erro inesperado na sincronização.");
      setTones([]);
      setUsedPrefix(null);
    } finally {
      setLoading(false);
    }
  }

  async function persistTessitura(fileId: string, result: Awaited<ReturnType<typeof analyzeAudioUrlPitch>>) {
    const response = await fetch(`/api/audio/${fileId}/analyze-tessitura`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        detectedMinMidiNote: result.minMidiNote,
        detectedMaxMidiNote: result.maxMidiNote,
        confidence: result.confidence,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error ?? "Não foi possível salvar a análise de tessitura.");
    }

    if (data?.migrationRequired) {
      return { saved: false, migrationRequired: true };
    }

    return { saved: true, migrationRequired: false };
  }

  async function analyzeSingleFile(file: KitAudioFile) {
    if (!file.id) {
      throw new Error("Sincronize os áudios antes de analisar a tessitura.");
    }

    const result = await analyzeAudioUrlPitch(`/api/audio/${file.id}`);

    if (typeof result.minMidiNote !== "number" || typeof result.maxMidiNote !== "number") {
      throw new Error("Não foi possível detectar notas suficientes neste áudio.");
    }

    return persistTessitura(file.id, result);
  }

  async function analyzeTessitura(file: KitAudioFile) {
    setAnalyzingKey(file.id ?? file.key);
    setError(null);
    setAnalysisSummary(null);

    try {
      const result = await analyzeSingleFile(file);

      if (result.migrationRequired) {
        setError("A análise rodou, mas não foi salva porque as colunas de tessitura ainda não existem no banco. Aplique a migration de tessitura no Supabase.");
        return;
      }

      await loadSyncedAudios();
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Erro inesperado ao analisar tessitura.");
    } finally {
      setAnalyzingKey(null);
    }
  }

  async function analyzeAllTessituras() {
    const filesToAnalyze = pendingFiles.length > 0 ? pendingFiles : allFiles.filter((file) => typeof file.id === "string");

    if (filesToAnalyze.length === 0) {
      setError("Nenhum áudio sincronizado disponível para análise.");
      return;
    }

    setAnalyzingAll(true);
    setError(null);
    setAnalysisSummary({ total: filesToAnalyze.length, analyzed: 0, saved: 0, failed: 0, migrationRequired: false });

    let analyzed = 0;
    let saved = 0;
    let failed = 0;
    let migrationRequired = false;

    for (const file of filesToAnalyze) {
      setAnalyzingKey(file.id ?? file.key);

      try {
        const result = await analyzeSingleFile(file);
        analyzed += 1;
        if (result.saved) saved += 1;
        if (result.migrationRequired) migrationRequired = true;
      } catch (batchError) {
        console.error("[KitAudioSyncCard] tessitura batch analysis failed", file, batchError);
        failed += 1;
      }

      setAnalysisSummary({ total: filesToAnalyze.length, analyzed, saved, failed, migrationRequired });
    }

    setAnalyzingKey(null);
    setAnalyzingAll(false);

    if (migrationRequired) {
      setError("As análises rodaram, mas uma ou mais não foram salvas porque a migration de tessitura ainda não foi aplicada no Supabase.");
      return;
    }

    await loadSyncedAudios();
  }

  function formatTessitura(file: KitAudioFile) {
    const min = file.minMidiNote ?? file.detectedMinMidiNote;
    const max = file.maxMidiNote ?? file.detectedMaxMidiNote;

    if (typeof min !== "number" || typeof max !== "number") return "Não analisado";

    return `${midiToNoteName(min)} → ${midiToNoteName(max)}`;
  }

  function formatConfidence(file: KitAudioFile) {
    if (typeof file.tessituraConfidence !== "number") return null;
    return `${Math.round(file.tessituraConfidence * 100)}%`;
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-premium">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Áudios do R2</h2>
          <p className="text-sm text-muted">Sincronize, carregue e analise a tessitura de cada voz por tom.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void loadSyncedAudios()} disabled={loadingFiles || loading || analyzingAll} className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60">
            {loadingFiles ? "Carregando..." : "Atualizar lista"}
          </button>
          <button type="button" onClick={() => void analyzeAllTessituras()} disabled={loading || loadingFiles || analyzingAll || allFiles.length === 0} className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60">
            {analyzingAll ? "Analisando todas..." : `Analisar todas${pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ""}`}
          </button>
          <button type="button" onClick={() => void enqueueAiAnalysisBatch()} disabled={loading || loadingFiles || analyzingAll || pendingFiles.length === 0} className="rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-60">
            {analyzingAll ? "Análise IA em massa..." : `Analisar Tessitura IA em Massa${pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ""}`}
          </button>
          <button type="button" onClick={() => void syncAudios()} disabled={loading || analyzingAll} className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Sincronizando..." : "Sincronizar áudios"}
          </button>
          <button type="button" onClick={() => void generateTonesAutomatically()} disabled={jobLoading || loading || loadingFiles || allFiles.length === 0} className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60">
            {jobLoading ? "Enfileirando..." : "Gerar tons automaticamente"}
          </button>
        </div>
      </div>

      {!hasTessituraColumns ? <p className="mb-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">As colunas de tessitura ainda não existem no banco. A lista funciona, mas a análise só será salva depois que a migration for aplicada no Supabase.</p> : null}
      {error ? <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {analysisSummary ? <p className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-muted">Progresso da análise: {analysisSummary.analyzed}/{analysisSummary.total} processadas • {analysisSummary.saved} salvas • {analysisSummary.failed} falharam</p> : null}
      {usedPrefix ? <p className="mb-3 text-xs text-muted">Prefixo usado na sincronização: <span className="font-mono text-foreground">{usedPrefix}</span></p> : null}
      {analysisSubmitMessage ? <p className="mb-3 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">{analysisSubmitMessage}</p> : null}
      {analysisSubmitError ? <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{analysisSubmitError}</p> : null}

      <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
          <div className="border-b border-white/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-300">Pipeline de geração</p>
                <h3 className="mt-1 text-base font-semibold text-foreground">Tons automáticos em tempo real</h3>
                <p className="mt-1 text-xs text-muted">O worker processa um tom por vez e salva os MP3 finais no R2.</p>
              </div>
              <button type="button" onClick={() => void loadJobs()} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10">
                Atualizar status
              </button>
      </div>

      <div className="mb-5 overflow-hidden rounded-2xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),rgba(15,23,42,0.9))] shadow-[0_20px_70px_rgba(8,145,178,0.25)]">
        <div className="border-b border-cyan-300/20 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">Harmomus IA Analysis</p>
          <h3 className="mt-1 text-base font-semibold text-white">Status da análise de tessitura via IA</h3>
          <p className="mt-1 text-xs text-cyan-100/80">Em breve: tessitura, comfort range, notas e recomendações. Por enquanto: status e logs.</p>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-4">
          {["pending", "processing", "completed", "failed"].map((status) => (
            <div key={status} className="rounded-xl border border-cyan-300/20 bg-slate-900/50 p-3">
              <span className="block text-lg font-semibold text-cyan-100">{analysisJobs.filter((job) => job.status === status).length}</span>
              <span className="text-[11px] uppercase tracking-wide text-cyan-100/70">{status}</span>
            </div>
          ))}
        </div>
      </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-400 transition-all" style={{ width: `${jobStats.progress}%` }} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3"><span className="block text-lg font-semibold text-emerald-200">{jobStats.completed}</span><span className="text-[11px] uppercase tracking-wide text-emerald-100/70">Concluídos</span></div>
              <div className="rounded-xl border border-sky-400/20 bg-sky-500/10 p-3"><span className="block text-lg font-semibold text-sky-200">{jobStats.processing}</span><span className="text-[11px] uppercase tracking-wide text-sky-100/70">Processando</span></div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3"><span className="block text-lg font-semibold text-amber-200">{jobStats.pending}</span><span className="text-[11px] uppercase tracking-wide text-amber-100/70">Na fila</span></div>
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3"><span className="block text-lg font-semibold text-red-200">{jobStats.failed}</span><span className="text-[11px] uppercase tracking-wide text-red-100/70">Falhas</span></div>
            </div>

            {lastJobRefresh ? <p className="mt-3 text-[11px] text-muted">Última atualização: {formatTime(lastJobRefresh)}</p> : null}
            {jobError ? <p className="mt-2 text-[11px] text-red-300">Erro no status: {jobError}</p> : null}
          </div>

          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.length === 0 ? (
              <div className="col-span-full rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted">
                Sem jobs ativos ou recentes para este kit.
              </div>
            ) : (
              jobs.map((job) => {
                const status = getStatusMeta(job.status);
                return (
                  <article key={job.id} className={`rounded-xl border p-3 ${status.className}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
                        <span className="text-xs font-semibold uppercase tracking-wide">{status.label}</span>
                      </div>
                      <span className="rounded-full border border-current/20 px-2 py-0.5 text-xs font-bold">{job.target_tone}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{formatJobVoice(job.voice)} {job.source_tone ? `${job.source_tone} → ${job.target_tone}` : job.target_tone}</p>
                    <p className="mt-1 text-xs opacity-80">Modulação: {formatShift(job.semitone_shift)}</p>
                    {job.error_message ? <p className="mt-2 line-clamp-2 rounded-lg bg-black/20 p-2 text-[11px] text-red-100">{job.error_message}</p> : null}
                    {job.completed_at ? <p className="mt-2 text-[11px] opacity-70">Concluído às {formatTime(job.completed_at)}</p> : null}
                  </article>
                );
              })
            )}
          </div>
        </div>

      {tones.length === 0 && !loading && !loadingFiles ? <p className="text-sm text-muted">Nenhum áudio encontrado ainda para este kit.</p> : null}
      {generatedTones.length > 0 ? (
        <div className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-4">
          <h3 className="text-sm font-semibold text-emerald-200">Tons gerados</h3>
          <p className="mt-1 text-xs text-emerald-100/80">{generatedTones.map((tone) => tone.tone).join(", ")}</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {sortedToneGroups.map((toneGroup) => (
          <article key={toneGroup.tone} className="rounded-lg border border-border bg-surface-muted p-4">
            <h3 className="mb-2 text-sm font-semibold text-gold-300">Tom {toneGroup.tone}</h3>
            <p className="mb-3 text-xs text-muted">{toneGroup.files.length} arquivo(s)</p>
            <div className="space-y-3">
              {VOICE_ORDER.map((voice) => {
                const voiceFiles = toneGroup.files.filter((file) => file.voice === voice);
                if (voiceFiles.length === 0) return null;
                return (
                  <section key={`${toneGroup.tone}-${voice}`}>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{voice}</h4>
                    <ul className="space-y-2">
                      {voiceFiles.map((file) => {
                        const confidence = formatConfidence(file);
                        const isAnalyzing = analyzingKey === file.id;

                        return (
                          <li key={file.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-xs">
                            <div>
                              <span className="block font-medium text-foreground">{file.name}</span>
                              <span className="text-muted">.{file.fileType}</span>
                            </div>
                            <div className="text-right">
                              <span className="block text-foreground">{formatTessitura(file)}</span>
                              <span className="text-muted">
                                {file.tessituraSource ? `Fonte: ${file.tessituraSource}` : "Fonte: —"}
                                {confidence ? ` • Confiança: ${confidence}` : ""}
                              </span>
                            </div>
                            <button type="button" onClick={() => void analyzeTessitura(file)} disabled={Boolean(analyzingKey) || analyzingAll} className="rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-300 hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                              {isAnalyzing ? "Analisando..." : "Analisar tessitura"}
                            </button>
                            <button type="button" onClick={() => void enqueueAiAnalysis(file.id)} disabled={!file.id || Boolean(analysisLoadingFileId)} className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                              {analysisLoadingFileId === file.id ? "criando análise..." : "Analisar Tessitura IA"}
                            </button>
                            <div className="min-w-[190px] text-right">
                              {(() => {
                                const job = getAnalysisJobForFile(file.id);
                                if (!job) return <span className="text-[11px] text-cyan-100/70">IA: sem job</span>;
                                const log = Array.isArray(job.analysis_logs) && job.analysis_logs[0]?.message ? job.analysis_logs[0].message : null;
                                return (
                                  <>
                                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-cyan-100">IA: {job.status}</span>
                                    <span className="block text-[11px] text-cyan-100/80">Tessitura: {job.detected_min_note != null ? midiToNoteName(job.detected_min_note) : "—"} → {job.detected_max_note != null ? midiToNoteName(job.detected_max_note) : "—"}</span>
                                    <span className="block text-[11px] text-cyan-100/80">Confortável: {job.comfort_min_note != null ? midiToNoteName(job.comfort_min_note) : "—"} → {job.comfort_max_note != null ? midiToNoteName(job.comfort_max_note) : "—"}</span>
                                    <span className="block max-w-[220px] truncate text-[11px] text-cyan-100/70">{job.error_message ?? log ?? "sem logs"}</span>
                                  </>
                                );
                              })()}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
