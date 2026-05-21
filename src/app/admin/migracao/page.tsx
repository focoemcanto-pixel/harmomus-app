"use client";

import { useMemo, useState } from "react";

type CsvRow = {
  email: string;
  name: string;
  plan: string;
  status: "active" | "overdue" | "canceled" | "expired" | "pending";
  stripe_customer_id: string;
  stripe_subscription_id: string;
  next_billing_at?: string;
};

export default function MigracaoPage() {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [result, setResult] = useState<Array<{ email: string; status: string; message: string }>>([]);
  const [loading, setLoading] = useState(false);

  const invalidCount = useMemo(() => rows.filter((r) => !r.email || !r.plan || !r.stripe_customer_id || !r.stripe_subscription_id).length, [rows]);

  function parseCsv(text: string) {
    const lines = text.trim().split(/\r?\n/);
    const [, ...data] = lines;
    const parsed = data.map((line) => {
      const [email, name, plan, status, stripe_customer_id, stripe_subscription_id, next_billing_at] = line.split(",");
      return { email: email?.trim(), name: name?.trim(), plan: plan?.trim(), status: (status?.trim() || "pending") as CsvRow["status"], stripe_customer_id: stripe_customer_id?.trim(), stripe_subscription_id: stripe_subscription_id?.trim(), next_billing_at: next_billing_at?.trim() };
    });
    setRows(parsed);
  }

  async function runImport() {
    setLoading(true);
    const res = await fetch("/api/admin/migracao/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
    const data = await res.json();
    setResult(data.results || []);
    setLoading(false);
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold text-zinc-100">Migração PMS/Stripe → Harmomus</h1>
        <p className="mt-2 text-sm text-zinc-400">Importe CSV, valide conflitos e sincronize assinaturas reais no Stripe sem criar cobrança.</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <input type="file" accept=".csv" className="text-sm text-zinc-200" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; parseCsv(await f.text()); }} />
        <p className="mt-3 text-xs text-zinc-400">Formato: email,name,plan,status,stripe_customer_id,stripe_subscription_id,next_billing_at</p>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg text-zinc-100">Preview ({rows.length})</h2>
          <span className="text-sm text-amber-300">Conflitos/Inválidos: {invalidCount}</span>
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm text-zinc-200">
            <thead className="text-zinc-400"><tr><th>Email</th><th>Plano</th><th>Status</th><th>Stripe Customer</th><th>Stripe Subscription</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={`${r.email}-${i}`} className="border-t border-zinc-800"><td>{r.email}</td><td>{r.plan}</td><td>{r.status}</td><td>{r.stripe_customer_id}</td><td>{r.stripe_subscription_id}</td></tr>)}</tbody>
          </table>
        </div>
        <button onClick={runImport} disabled={loading || rows.length === 0} className="mt-4 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{loading ? "Importando..." : "Importar em lote"}</button>
      </div>

      {result.length > 0 && <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="mb-3 text-lg text-zinc-100">Logs</h2>{result.map((r, i) => <p key={`${r.email}-${i}`} className="text-sm text-zinc-300">{r.email} — <strong>{r.status}</strong> — {r.message}</p>)}</div>}
    </section>
  );
}
