"use client";

import { useState } from "react";

export default function Page() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/admin/import-r2-kits", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao sincronizar bucket.");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 text-white sm:space-y-6">
      <div className="rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_30%),linear-gradient(135deg,#07111f,#0c1225_60%,#180b2f)] p-4 shadow-[0_20px_80px_rgba(34,211,238,0.12)] sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200 sm:text-xs sm:tracking-[0.24em]">Admin Harmomus</p>
        <h1 className="mt-2 text-2xl font-black sm:mt-3 sm:text-4xl">Importador automático de kits</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300 sm:mt-3">
          Sincronize automaticamente os áudios existentes no bucket R2. O sistema detecta músicas, tons, vozes e evita duplicações automaticamente.
        </p>

        <div className="mt-5 sm:mt-7">
          <button
            onClick={handleImport}
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 text-sm font-black text-slate-950 shadow-[0_18px_60px_rgba(56,189,248,0.35)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-6"
          >
            {loading ? "Sincronizando bucket..." : "Sincronizar Bucket R2"}
          </button>
        </div>
      </div>

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-4 md:px-0">
        <FeatureCard eyebrow="Detecção automática" title="Músicas" description="Detecta automaticamente as pastas existentes no bucket." />
        <FeatureCard eyebrow="Leitura inteligente" title="Tons e vozes" description="Identifica tons e vozes através da estrutura dos arquivos." />
        <FeatureCard eyebrow="Proteção" title="Anti-duplicação" description="Arquivos já importados são ignorados automaticamente." />
        <FeatureCard eyebrow="Fluxo rápido" title="Catálogo em massa" description="Suba os áudios no bucket e sincronize tudo em segundos." />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200 sm:p-5">
          <p className="font-semibold">Erro</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}

      {result ? (
        <section className="space-y-4 sm:space-y-6">
          <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0 xl:grid-cols-6">
            <StatCard label="Pastas lidas" value={result.foldersScanned} />
            <StatCard label="Kits criados" value={result.kitsCreated} />
            <StatCard label="Kits atualizados" value={result.kitsUpdated} />
            <StatCard label="Áudios criados" value={result.audioFilesCreated} />
            <StatCard label="Áudios ignorados" value={result.audioFilesSkipped} />
            <StatCard label="Erros" value={result.errors?.length || 0} />
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200 sm:text-xs">Resultado da sincronização</p>
            <h2 className="mt-2 text-xl font-bold sm:text-2xl">Bucket sincronizado</h2>

            {result.errors?.length ? (
              <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
                {result.errors.map((item: string, index: number) => (
                  <div key={index} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-100 sm:px-4 sm:py-3">
                    {item}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100 sm:mt-5 sm:p-5">
                Nenhum erro encontrado. Os kits foram sincronizados com sucesso.
              </div>
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function FeatureCard({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="min-w-[190px] rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200 sm:text-xs sm:tracking-[0.18em]">{eyebrow}</p>
      <h3 className="mt-2 text-base font-semibold sm:mt-3 sm:text-lg">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-zinc-300 sm:mt-2 sm:text-sm">{description}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[145px] rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-4 shadow-[0_10px_40px_rgba(8,145,178,0.08)] sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200 sm:text-xs sm:tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-black sm:mt-3 sm:text-4xl">{value}</p>
    </div>
  );
}
