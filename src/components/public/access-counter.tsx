"use client";

interface AccessCounterProps {
  value: number;
}

export function AccessCounter({ value }: AccessCounterProps) {
  return <p className="text-xs text-muted">Acessos nesta sessão: {value}</p>;
}
