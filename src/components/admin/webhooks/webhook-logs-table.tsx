"use client";
import { useEffect, useState } from "react";
import type { WebhookLog } from "@/types/webhooks";

export function WebhookLogsTable() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  useEffect(() => { void (async () => { const res = await fetch("/api/admin/webhooks/logs"); const json = await res.json(); setLogs(json.data ?? []); })(); }, []);
  return <section className="space-y-4"><h1 className="text-3xl font-bold text-white">Logs de Webhooks</h1><div className="overflow-auto rounded-2xl border border-zinc-800"><table className="min-w-full text-sm"><thead className="bg-zinc-900 text-zinc-300"><tr><th className="px-3 py-2">Status</th><th>Evento</th><th>Duração</th><th>Retry</th><th>Data</th></tr></thead><tbody>{logs.map((log)=><tr key={log.id} className="border-t border-zinc-800"><td className="px-3 py-2">{log.success?"✅":"❌"} {log.status}</td><td>{log.event}</td><td>{log.duration_ms}ms</td><td>{log.retry_attempt}</td><td>{new Date(log.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table></div></section>;
}
