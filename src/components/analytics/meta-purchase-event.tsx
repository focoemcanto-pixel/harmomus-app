"use client";

import { useEffect } from "react";

type MetaPurchaseEventProps = {
  planSlug?: string | null;
  sessionId?: string | null;
  subscriptionStatus?: string | null;
  enabled: boolean;
};

function planValue(planSlug?: string | null) {
  if (planSlug === "plus") return 19;
  if (planSlug === "premium") return 39;
  if (planSlug === "ministry_10") return 397;
  if (planSlug === "ministry_20") return 697;
  if (planSlug === "ministry_40") return 1297;
  return 0;
}

function planName(planSlug?: string | null) {
  return `Harmomus ${String(planSlug || "subscription").replaceAll("_", " ")}`;
}

export function MetaPurchaseEvent({ planSlug, sessionId, subscriptionStatus, enabled }: MetaPurchaseEventProps) {
  useEffect(() => {
    if (!enabled || !planSlug || typeof window === "undefined") return;

    const eventKey = `meta_purchase_${sessionId || planSlug}`;
    if (sessionStorage.getItem(eventKey)) return;

    const payload = {
      content_name: planName(planSlug),
      content_category: "subscription",
      content_type: "product",
      currency: "BRL",
      value: planValue(planSlug),
      plan: planSlug,
      subscription_status: subscriptionStatus || null,
      event_id: sessionId || undefined,
    };

    const fbq = (window as any).fbq;
    if (typeof fbq !== "function") return;

    fbq("track", "Purchase", payload);
    fbq("trackCustom", `Purchase_${planSlug}`, payload);
    sessionStorage.setItem(eventKey, "1");
  }, [enabled, planSlug, sessionId, subscriptionStatus]);

  return null;
}
