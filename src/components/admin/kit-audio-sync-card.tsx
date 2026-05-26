"use client";

import { useEffect, useMemo, useState } from "react";

import { analyzeAudioUrlPitch, midiToNoteName } from "@/lib/audio/pitch-analysis";
import type { KitAudioFile, KitAudioToneGroup } from "@/types/kit-audio";

interface AnalysisSummary {
  total: number;
  analyzed: number;
  saved: number;
  failed: number;
  migrationRequired: boolean;
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
  const [jobs, setJobs] = useState<Array<{ id: string; status: string; target_tone: string; error_message?: string | null }>>([]);

  const VOICE_ORDER = ["todos", "soprano", "contralto", "tenor"] as const;

  const allFiles = useMemo(() => tones.flatMap((tone) => tone.files), [tones]);
  const pendingFiles = useMemo(
    () => allFiles.filter((file) => typeof file.id === "string" && (typeof (file.minMidiNote ?? file.detectedMinMidiNote) !== "number" || typeof (file.maxMidiNote ?? file.detectedMaxMidiNote) !== "number")),
    [allFiles],
  );

  async function loadSyncedAudios() {
    setLoadingFiles(true);
    setError(null);

    try {
      const response = await fetch(`/api/kits/${kitId}/audio-files`, { method: "GET" });
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
  }, [kitId]);

  async function loadJobs() {
    const response = await fetch(`/api/audio/status?kitId=${kitId}`);
    const data = await response.json().catch(() => ({}));
    if (response.ok) setJobs((data.jobs ?? []) as any[]);
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
        body: JSON.stringify({ sourceAudioFileId: source.id, targetTones: targets, voice }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Falha ao enfileirar jobs.");
      await loadJobs();
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
          <button
            type="button"
            onClick={() => void loadSyncedAudios()}
            disabled={loadingFiles || loading || analyzingAll}
            className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingFiles ? "Carregando..." : "Atualizar lista"}
          </button>
          <button
            type="button"
            onClick={() => void analyzeAllTessituras()}
            disabled={loading || loadingFiles || analyzingAll || allFiles.length === 0}
            className="rounded-lg border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {analyzingAll ? "Analisando todas..." : `Analisar todas${pendingFiles.length > 0 ? ` (${pendingFiles.length})` : ""}`}
          </button>
          <button
            type="button"
            onClick={() => void syncAudios()}
            disabled={loading || analyzingAll}
            className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sincronizando..." : "Sincronizar áudios"}
          </button>
          <button
            type="button"
            onClick={() => void generateTonesAutomatically()}
            disabled={jobLoading || loading || loadingFiles || allFiles.length === 0}
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {jobLoading ? "Enfileirando..." : "Gerar tons automaticamente"}
          </button>
        </div>
      </div>

      {!hasTessituraColumns ? (
        <p className="mb-3 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-200">
          As colunas de tessitura ainda não existem no banco. A lista funciona, mas a análise só será salva depois que a migration for aplicada no Supabase.
        </p>
      ) : null}

      {error ? <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {analysisSummary ? (
        <p className="mb-3 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-muted">
          Progresso da análise: {analysisSummary.analyzed}/{analysisSummary.total} processadas • {analysisSummary.saved} salvas • {analysisSummary.failed} falharam
        </p>
      ) : null}

      {usedPrefix ? <p className="mb-3 text-xs text-muted">Prefixo usado na sincronização: <span className="font-mono text-foreground">{usedPrefix}</span></p> : null}

      {jobs.length > 0 ? (<div className="mb-4 rounded-lg border border-border bg-surface-muted p-3 text-xs text-muted">{jobs.map((job) => <p key={job.id}>{job.target_tone}: <strong>{job.status}</strong>{job.error_message ? ` — ${job.error_message}` : ""}</p>)}</div>) : null}

      {tones.length === 0 && !loading && !loadingFiles ? <p className="text-sm text-muted">Nenhum áudio encontrado ainda para este kit.</p> : null}

      <div className="space-y-4">
        {tones.map((toneGroup) => (
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
                            <button
                              type="button"
                              onClick={() => void analyzeTessitura(file)}
                              disabled={Boolean(analyzingKey) || analyzingAll}
                              className="rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-300 hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isAnalyzing ? "Analisando..." : "Analisar tessitura"}
                            </button>
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
