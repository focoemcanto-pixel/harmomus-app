"use client";

import { useMemo, useState } from "react";

import { PageHeader } from "@/components/admin/page-header";

type CsvRow = {
  email: string;
  name: string;
  plan: string;
  status: "active" | "overdue" | "canceled" | "expired" | "pending" | string;
};

type ImportResult = {
  email: string;
  status: "novo" | "existente" | "atualizado" | "invalido" | "conflito" | string;
  message: string;
};

type TestUser = {
  id: string;
  email: string;
  display_name: string | null;
  legacy_plan_slug: string | null;
  legacy_status: string | null;
  migrated: boolean | null;
  password_created: boolean | null;
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/^\uFEFF/, "");
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && next === '"' && insideQuotes) {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["active", "novo", "atualizado", "removido"].includes(normalized)) return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
  if (["pending", "existente"].includes(normalized)) return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (["invalido", "conflito", "overdue", "canceled", "expired"].includes(normalized)) return "border-red-400/30 bg-red-500/10 text-red-200";
  return "border-white/10 bg-white/5 text-zinc-200";
}

export default function MigracaoPage() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [result, setResult] = useState<ImportResult[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidCount = useMemo(
    () => rows.filter((row) => !row.email || !row.email.includes("@") || row.plan.toLowerCase() !== "free" || row.status.toLowerCase() !== "active").length,
    [rows],
  );

  function parseCsv(text: string) {
    setError(null);
    setResult([]);
    setSummary(null);

    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      setRows([]);
      setError("CSV vazio ou sem linhas de usuários.");
      return;
    }

    const headers = parseCsvLine(lines[0]).map(normalizeHeader);
    const emailIndex = headers.indexOf("email");
    const nameIndex = headers.findIndex((header) => ["name", "display_name", "nome", "full_name"].includes(header));
    const planIndex = headers.findIndex((header) => ["plan", "legacy_plan_slug", "plano"].includes(header));
    const statusIndex = headers.findIndex((header) => ["status", "legacy_status"].includes(header));

    if (emailIndex < 0) {
      setRows([]);
      setError("O CSV precisa ter uma coluna chamada email.");
      return;
    }

    const parsed = lines.slice(1).map((line) => {
      const columns = parseCsvLine(line);
      return {
        email: String(columns[emailIndex] ?? "").trim().toLowerCase(),
        name: nameIndex >= 0 ? String(columns[nameIndex] ?? "").trim() : "",
        plan: planIndex >= 0 ? String(columns[planIndex] ?? "free").trim().toLowerCase() || "free" : "free",
        status: statusIndex >= 0 ? String(columns[statusIndex] ?? "active").trim().toLowerCase() || "active" : "active",
      };
    });

    setRows(parsed);
  }

  async function runLegacyImport(dryRun: boolean) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/migracao/legacy/import-free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, dryRun }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? "Falha na importação.");

      setResult(data.results || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function loadTestUsers() {
    setCleanupLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/migracao/legacy/test-users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao buscar usuários de teste.");
      setTestUsers(data.testUsers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function removeTestUsers() {
    setCleanupLoading(true);
    setError(null);

    try {
      const emails = testUsers.map((user) => user.email);
      const res = await fetch("/api/admin/migracao/legacy/test-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao remover usuários de teste.");
      await loadTestUsers();
      setResult((data.removed || []).map((email: string) => ({ email, status: "removido", message: "Removido de legacy_members." })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setCleanupLoading(false);
    }
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <PageHeader title="Migração Free WordPress → Harmomus" description="Importe usuários Free ativos para legacy_members preservando o fluxo validado de ativação por e-mail." />

      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
        <MetricCard label="CSV" value={rows.length} helper="linhas carregadas" tone="cyan" />
        <MetricCard label="Inválidos" value={invalidCount} helper="precisam revisão" tone="amber" />
        <MetricCard label="Testes" value={testUsers.length} helper="usuários listados" tone="red" />
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
            <h2 className="text-lg font-semibold text-white">1. Importar CSV de usuários Free</h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              Colunas aceitas: <code>email</code>, <code>name</code>/<code>nome</code>, <code>plan</code>/<code>plano</code>, <code>status</code>. Se plano/status vierem vazios, serão tratados como <strong>free</strong> e <strong>active</strong>.
            </p>
            <input
              type="file"
              accept=".csv"
              className="mt-4 block w-full text-xs text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-gold-500/15 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-gold-200"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                parseCsv(await file.text());
              }}
            />
          </div>

          <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Preview ({rows.length})</h2>
                <p className="text-xs text-muted">Revise antes de simular ou importar.</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${invalidCount ? "border-amber-400/30 bg-amber-500/10 text-amber-200" : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"}`}>Inválidos: {invalidCount}</span>
            </div>

            <div className="grid max-h-96 gap-2 overflow-auto lg:hidden">
              {rows.map((row, index) => (
                <article key={`${row.email}-${index}`} className="rounded-2xl border border-border bg-background/55 p-3">
                  <p className="truncate text-sm font-semibold text-white">{row.email || "Sem e-mail"}</p>
                  <p className="mt-1 truncate text-xs text-muted">{row.name || "Sem nome"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-zinc-300">{row.plan || "free"}</span>
                    <span className={`rounded-full border px-2.5 py-1 ${statusTone(row.status)}`}>{row.status}</span>
                  </div>
                </article>
              ))}
              {rows.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nenhum CSV carregado.</p> : null}
            </div>

            <div className="hidden max-h-96 overflow-auto rounded-2xl border border-border lg:block">
              <table className="w-full text-left text-sm text-zinc-200">
                <thead className="bg-background text-muted">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Plano</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.email}-${index}`} className="border-t border-border">
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2">{row.name || "—"}</td>
                      <td className="px-3 py-2">{row.plan}</td>
                      <td className="px-3 py-2">{row.status}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-muted" colSpan={4}>Nenhum CSV carregado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <button onClick={() => runLegacyImport(true)} disabled={loading || rows.length === 0} className="rounded-2xl border border-violet-500/50 px-4 py-3 text-sm font-medium text-violet-200 disabled:opacity-40">
                {loading ? "Processando..." : "Simular importação"}
              </button>
              <button onClick={() => runLegacyImport(false)} disabled={loading || rows.length === 0 || invalidCount > 0} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-40">
                {loading ? "Importando..." : "Importar para legacy_members"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <h2 className="text-lg font-semibold text-white">2. Limpeza de testes</h2>
          <p className="mt-2 text-xs leading-5 text-muted">Lista apenas e-mails de teste aprovados para limpeza. Usuários que já criaram senha são protegidos pela API.</p>
          <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap sm:gap-3">
            <button onClick={loadTestUsers} disabled={cleanupLoading} className="rounded-2xl border border-border px-4 py-3 text-sm text-zinc-100 disabled:opacity-40">
              {cleanupLoading ? "Carregando..." : "Listar testes"}
            </button>
            <button onClick={removeTestUsers} disabled={cleanupLoading || testUsers.length === 0} className="rounded-2xl bg-red-700 px-4 py-3 text-sm font-medium text-white disabled:opacity-40">
              Remover testes listados
            </button>
          </div>

          <div className="mt-4 max-h-96 space-y-2 overflow-auto">
            {testUsers.map((user) => (
              <div key={user.id} className="rounded-2xl border border-border bg-background/55 p-3 text-sm text-zinc-300">
                <p className="truncate font-medium text-white">{user.email}</p>
                <p className="truncate text-xs text-muted">{user.display_name || "Sem nome"}</p>
                <p className="mt-2 text-[11px] text-zinc-500">migrated: {String(user.migrated)} · password_created: {String(user.password_created)}</p>
              </div>
            ))}
            {testUsers.length === 0 && <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">Nenhum teste carregado.</p>}
          </div>
        </div>
      </div>

      {(summary || result.length > 0) && (
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
          <h2 className="mb-3 text-lg font-semibold text-white">Resultado</h2>
          {summary && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1 text-xs text-zinc-300">
              {Object.entries(summary).map(([key, value]) => (
                <span key={key} className="shrink-0 rounded-full bg-background px-3 py-1">{key}: {value}</span>
              ))}
            </div>
          )}
          <div className="max-h-80 space-y-2 overflow-auto">
            {result.map((item, index) => (
              <article key={`${item.email}-${index}`} className="rounded-2xl border border-border bg-background/55 p-3 text-sm text-zinc-300">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="truncate font-medium text-white">{item.email}</p>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] ${statusTone(item.status)}`}>{item.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{item.message}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value, helper, tone }: { label: string; value: number; helper: string; tone: "cyan" | "amber" | "red" }) {
  const toneClass = tone === "cyan" ? "text-cyan-300" : tone === "amber" ? "text-amber-300" : "text-red-300";
  return (
    <div className="min-w-[150px] rounded-3xl border border-border bg-surface p-4 shadow-premium sm:p-5">
      <p className={`text-[11px] uppercase tracking-[0.18em] sm:text-xs ${toneClass}`}>{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-muted sm:text-sm">{helper}</p>
    </div>
  );
}
