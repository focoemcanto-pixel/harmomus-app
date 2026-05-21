"use client";

interface AccessCounterProps {
  value: number;
  limit: number;
}

export function AccessCounter({ value, limit }: AccessCounterProps) {
  return <p className="text-xs text-muted">Kits usados (24h): {value}/{limit}</p>;
}
