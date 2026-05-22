"use client";

import { useState } from "react";

import type { KitAudioToneGroup } from "@/types/kit-audio";

export function KitAudioSyncCard({ kitId }: { kitId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tones, setTones] = useState<KitAudioToneGroup[]>([]);
  const [usedPrefix, setUsedPrefix] = useState<string | null>(null);

  const VOICE_ORDER = ["todos", "soprano", "contralto", "tenor"] as const;

  async function syncAudios() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/kits/${kitId}/sync-audio`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível sincronizar os áudios.");
      setTones((data?.tones ?? []) as KitAudioToneGroup[]);
      setUsedPrefix(typeof data?.usedPrefix === "string" ? data.usedPrefix : null);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Erro inesperado na sincronização.");
      setTones([]);
      setUsedPrefix(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-premium">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Áudios do R2</h2>
          <p className="text-sm text-muted">Sincronize os arquivos por tom. Estrutura pronta para player futuro.</p>
        </div>
        <button
          type="button"
          onClick={() => void syncAudios()}
          disabled={loading}
          className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Sincronizando..." : "Sincronizar áudios"}
        </button>
      </div>

      {error ? <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {usedPrefix ? <p className="mb-3 text-xs text-muted">Prefixo usado na sincronização: <span className="font-mono text-foreground">{usedPrefix}</span></p> : null}

      {tones.length === 0 && !loading ? <p className="text-sm text-muted">Nenhum áudio encontrado ainda para este kit.</p> : null}

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
                      {voiceFiles.map((file) => (
                        <li key={file.key} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs">
                          <span className="font-medium text-foreground">{file.name}</span>
                          <span className="text-muted">.{file.fileType}</span>
                        </li>
                      ))}
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
