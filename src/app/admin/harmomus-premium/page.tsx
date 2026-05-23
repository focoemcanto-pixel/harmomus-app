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
    <main className="min-h-screen bg-[#050816] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="rounded-3xl border border-cyan-400/20 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.15),transparent_30%),linear-gradient(135deg,#07111f,#0c1225_60%,#180b2f)] p-8 shadow-[0_20px_80px_rgba(34,211,238,0.12)]">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Admin Harmomus</p>
          <h1 className="mt-3 text-4xl font-black">Importador automático de kits</h1>
          <p className="mt-3 max-w-3xl text-zinc-300">
            Sincronize automaticamente os áudios existentes no bucket R2. O sistema detecta músicas, tons, vozes e evita duplicações automaticamente.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={handleImport}
              disabled={loading}
              className="rounded-2xl bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_18px_60px_rgba(56,189,248,0.35)] transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sincronizando bucket..." : "Sincronizar Bucket R2"}
            </button>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Detecção automática</p>
            <h3 className="mt-3 text-lg font-semibold">Músicas</h3>
            <p className="mt-2 text-sm text-zinc-300">Detecta automaticamente as pastas existentes no bucket.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Leitura inteligente</p>
            <h3 className="mt-3 text-lg font-semibold">Tons e vozes</h3>
            <p className="mt-2 text-sm text-zinc-300">Identifica tons e vozes através da estrutura dos arquivos.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Proteção</p>
            <h3 className="mt-3 text-lg font-semibold">Anti-duplicação</h3>
            <p className="mt-2 text-sm text-zinc-300">Arquivos já importados são ignorados automaticamente.</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Fluxo rápido</p>
            <h3 className="mt-3 text-lg font-semibold">Catálogo em massa</h3>
            <p className="mt-2 text-sm text-zinc-300">Suba os áudios no bucket e sincronize tudo em segundos.</p>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-5 text-red-200">
            <p className="font-semibold">Erro</p>
            <p className="mt-1 text-sm">{error}</p>
          </div>
        ) : null}

        {result ? (
          <section className="space-y-6">
            <div className="grid gap-5 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Pastas lidas" value={result.foldersScanned} />
              <StatCard label="Kits criados" value={result.kitsCreated} />
              <StatCard label="Kits atualizados" value={result.kitsUpdated} />
              <StatCard label="Áudios criados" value={result.audioFilesCreated} />
              <StatCard label="Áudios ignorados" value={result.audioFilesSkipped} />
              <StatCard label="Erros" value={result.errors?.length || 0} />
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Resultado da sincronização</p>
                  <h2 className="mt-2 text-2xl font-bold">Bucket sincronizado</h2>
                </div>
              </div>

              {result.errors?.length ? (
                <div className="mt-5 space-y-3">
                  {result.errors.map((item: string, index: number) => (
                    <div key={index} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                      {item}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-emerald-100">
                  Nenhum erro encontrado. Os kits foram sincronizados com sucesso.
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/[0.03] p-5 shadow-[0_10px_40px_rgba(8,145,178,0.08)]">
      <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">{label}</p>
      <p className="mt-3 text-4xl font-black">{value}</p>
    </div>
  );
}
