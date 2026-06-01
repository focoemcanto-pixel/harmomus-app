"use client";

interface AccessCounterProps {
  value: number;
  limit: number;
}

export function AccessCounter({ value, limit }: AccessCounterProps) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  const safeValue = Math.min(Math.max(0, Number(value) || 0), safeLimit || 0);

  return <p className="text-xs text-muted">Visitas válidas (24h): {safeValue}/{safeLimit}</p>;
}
