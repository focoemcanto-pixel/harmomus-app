"use client";

import { useState } from "react";

type SubscribeButtonProps = {
  planSlug: "free" | "plus" | "premium";
  label: string;
  className?: string;
};

export function SubscribeButton({ planSlug, label, className }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setLoading(true);
    setError(null);

    if (planSlug === "free") {
      window.location.href = "/login?redirect=%2Fassinar%3Fplan%3Dfree";
      return;
    }

    try {
      window.location.href = `/api/billing/checkout?plan=${encodeURIComponent(planSlug)}`;
    } catch {
      setError("Não foi possível iniciar o checkout agora. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={onClick} disabled={loading} className={className}>
        {loading ? "Redirecionando..." : label}
      </button>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
