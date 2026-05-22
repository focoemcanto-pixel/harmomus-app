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

  const onClick = async () => {
    setLoading(true);
    setError(null);

    if (planSlug === "free") {
      window.location.href = "/login?redirect=%2Fassinar%3Fplan%3Dfree";
      return;
    }

    try {
      const response = await fetch(`/api/billing/checkout?plan=${encodeURIComponent(planSlug)}`, { method: "GET", redirect: "manual" });
      if (response.type === "opaqueredirect") return;
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          window.location.href = location;
          return;
        }
      }
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Não foi possível iniciar o checkout agora. Tente novamente.");
    } catch {
      setError("Não foi possível iniciar o checkout agora. Tente novamente.");
    } finally {
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
