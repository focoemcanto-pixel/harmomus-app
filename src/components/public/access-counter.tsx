"use client";

interface AccessCounterStats {
  accessCountToday?: number;
  remaining?: number;
  limit?: number;
  nextResetAt?: string;
}

interface AccessCounterProps {
  value?: number;
  limit?: number;
  stats?: AccessCounterStats | null;
}

export function AccessCounter({ value, limit, stats }: AccessCounterProps) {
  const resolvedLimit = limit ?? stats?.limit ?? 0;
  const resolvedValue = value ?? stats?.accessCountToday ?? Math.max(0, resolvedLimit - (stats?.remaining ?? 0));
  const safeLimit = Math.max(0, Number(resolvedLimit) || 0);
  const safeValue = Math.min(Math.max(0, Number(resolvedValue) || 0), safeLimit || 0);

  if (!safeLimit) return null;

  return <p className="text-xs text-muted">Visitas válidas (24h): {safeValue}/{safeLimit}</p>;
}
