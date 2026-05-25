"use client";

import { useEffect, useState } from "react";

import { analyzeAudioUrlPitch, midiToNoteName } from "@/lib/audio/pitch-analysis";
import type { KitAudioFile, KitAudioToneGroup } from "@/types/kit-audio";

export function KitAudioSyncCard({ kitId }: { kitId: string }) {
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [analyzingKey, setAnalyzingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tones, setTones] = useState<KitAudioToneGroup[]>([]);
  const [usedPrefix, setUsedPrefix] = useState<string | null>(null);

  const VOICE_ORDER = ["todos", "soprano", "contralto", "tenor"] as const;

  async function loadSyncedAudios() {
    setLoadingFiles(true);
    setError(null);

    try {
      const response = await fetch(`/api/kits/${kitId}/audio-files`, { method: "GET" });
      const data = await response.json();

      if (!response.ok) throw new Error(data?.error ?? "Não foi possível carregar os áudios sincronizados.");

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
  }, [kitId]);

  async function syncAudios() {
    setLoading(true);
    setError(null);
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

  async function analyzeTessitura(file: KitAudioFile) {
    if (!file.id) {
      setError("Sincronize os áudios antes de analisar a tessitura.");
      return;
    }

    setAnalyzingKey(file.id);
    setError(null);

    try {
      const result = await analyzeAudioUrlPitch(`/api/audio/${file.id}`);

      const response = await fetch(`/api/audio/${file.id}/analyze-tessitura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detectedMinMidiNote: result.minMidiNote,
          detectedMaxMidiNote: result.maxMidiNote,
          confidence: result.confidence,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível salvar a análise de tessitura.");

      await loadSyncedAudios();
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Erro inesperado ao analisar tessitura.");
    } finally {
      setAnalyzingKey(null);
    }
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
            disabled={loadingFiles || loading}
            className="rounded-lg border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-muted transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingFiles ? "Carregando..." : "Atualizar lista"}
          </button>
          <button
            type="button"
            onClick={() => void syncAudios()}
            disabled={loading}
            className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sincronizando..." : "Sincronizar áudios"}
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {usedPrefix ? <p className="mb-3 text-xs text-muted">Prefixo usado na sincronização: <span className="font-mono text-foreground">{usedPrefix}</span></p> : null}

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
                              disabled={Boolean(analyzingKey)}
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
