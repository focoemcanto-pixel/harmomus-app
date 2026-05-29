"use client";

import { useMemo, useState } from "react";

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
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold text-zinc-100">Migração Free WordPress → Harmomus</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Importe usuários Free ativos para <strong>legacy_members</strong>. Esta tela não cria login, perfil nem assinatura diretamente; ela preserva o fluxo validado de ativação por e-mail.
        </p>
      </div>

      {error && <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-medium text-zinc-100">1. Importar CSV de usuários Free</h2>
            <p className="mt-2 text-xs text-zinc-400">
              Colunas aceitas: <code>email</code>, <code>name</code>/<code>nome</code>, <code>plan</code>/<code>plano</code>, <code>status</code>. Se plano/status vierem vazios, serão tratados como <strong>free</strong> e <strong>active</strong>.
            </p>
            <input
              type="file"
              accept=".csv"
              className="mt-4 text-sm text-zinc-200"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                parseCsv(await file.text());
              }}
            />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg text-zinc-100">Preview ({rows.length})</h2>
                <p className="text-xs text-zinc-500">Revise antes de simular ou importar.</p>
              </div>
              <span className="text-sm text-amber-300">Inválidos no CSV: {invalidCount}</span>
            </div>

            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-sm text-zinc-200">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Plano</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.email}-${index}`} className="border-t border-zinc-800">
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2">{row.name || "—"}</td>
                      <td className="px-3 py-2">{row.plan}</td>
                      <td className="px-3 py-2">{row.status}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-3 py-6 text-center text-zinc-500" colSpan={4}>
                        Nenhum CSV carregado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => runLegacyImport(true)}
                disabled={loading || rows.length === 0}
                className="rounded-md border border-violet-500 px-4 py-2 text-sm font-medium text-violet-200 disabled:opacity-40"
              >
                {loading ? "Processando..." : "Simular importação"}
              </button>
              <button
                onClick={() => runLegacyImport(false)}
                disabled={loading || rows.length === 0 || invalidCount > 0}
                className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {loading ? "Importando..." : "Importar para legacy_members"}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-lg font-medium text-zinc-100">2. Limpeza de testes</h2>
          <p className="mt-2 text-xs text-zinc-400">
            Lista apenas os e-mails de teste aprovados para limpeza. Usuários que já criaram senha são protegidos pela API.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={loadTestUsers}
              disabled={cleanupLoading}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-100 disabled:opacity-40"
            >
              {cleanupLoading ? "Carregando..." : "Listar testes"}
            </button>
            <button
              onClick={removeTestUsers}
              disabled={cleanupLoading || testUsers.length === 0}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Remover testes listados
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {testUsers.map((user) => (
              <div key={user.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                <p className="font-medium text-zinc-100">{user.email}</p>
                <p>{user.display_name || "Sem nome"}</p>
                <p className="text-xs text-zinc-500">
                  migrated: {String(user.migrated)} · password_created: {String(user.password_created)}
                </p>
              </div>
            ))}
            {testUsers.length === 0 && <p className="text-sm text-zinc-500">Nenhum teste carregado.</p>}
          </div>
        </div>
      </div>

      {(summary || result.length > 0) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 text-lg text-zinc-100">Resultado</h2>
          {summary && (
            <div className="mb-4 flex flex-wrap gap-2 text-xs text-zinc-300">
              {Object.entries(summary).map(([key, value]) => (
                <span key={key} className="rounded-full bg-zinc-800 px-3 py-1">
                  {key}: {value}
                </span>
              ))}
            </div>
          )}
          <div className="max-h-80 space-y-2 overflow-auto">
            {result.map((item, index) => (
              <p key={`${item.email}-${index}`} className="text-sm text-zinc-300">
                {item.email} — <strong>{item.status}</strong> — {item.message}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
