"use client";

import { useState } from "react";

type SubscribeButtonProps = {
  planSlug: "free" | "plus" | "premium" | "ministry_10" | "ministry_20" | "ministry_40";
  label: string;
  className?: string;
};

export function SubscribeButton({ planSlug, label, className }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    setLoading(true);

    if (planSlug === "free") {
      window.location.assign("/login?redirect=%2Fassinar%3Fplan%3Dfree");
      return;
    }

    window.location.assign(`/api/billing/checkout?plan=${encodeURIComponent(planSlug)}`);
  };

  return (
    <button type="button" onClick={onClick} disabled={loading} className={className}>
      {loading ? "Redirecionando..." : label}
    </button>
  );
}
