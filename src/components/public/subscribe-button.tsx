"use client";

import { useState } from "react";

type SubscribeButtonProps = {
  planSlug: "free" | "plus" | "premium" | "ministry_10" | "ministry_20" | "ministry_40";
  label: string;
  className?: string;
};

const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];

function planValue(planSlug: SubscribeButtonProps["planSlug"]) {
  if (planSlug === "plus") return 19;
  if (planSlug === "premium") return 39;
  if (planSlug === "ministry_10") return 397;
  if (planSlug === "ministry_20") return 697;
  if (planSlug === "ministry_40") return 1297;
  return 0;
}

function readStoredAttribution() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem("harmomus_attribution") || "{}");
  } catch {
    return {};
  }
}

function readAttributionParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const params = new URLSearchParams(window.location.search);
  const stored = readStoredAttribution() as Record<string, unknown>;
  const result = new URLSearchParams();

  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key) ?? (typeof stored[key] === "string" ? stored[key] : null);
    if (value) result.set(key, value);
  }

  return result;
}

function recordFunnelEvent(eventName: string, payload: Record<string, unknown>) {
  fetch("/api/meta-events/record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventName, payload, eventId: `${eventName}_${Date.now()}`, url: window.location.href }),
    keepalive: true,
  }).catch(() => undefined);
}

function trackInitiateCheckout(planSlug: SubscribeButtonProps["planSlug"]) {
  if (typeof window === "undefined" || planSlug === "free") return;
  const fbq = (window as any).fbq;
  if (typeof fbq !== "function") return;

  const payload = {
    content_name: `Harmomus ${planSlug.replaceAll("_", " ")}`,
    content_category: "subscription",
    content_type: "product",
    currency: "BRL",
    value: planValue(planSlug),
    plan: planSlug,
    ...(readStoredAttribution() as Record<string, unknown>),
  };

  fbq("track", "InitiateCheckout", payload);
  fbq("trackCustom", `InitiateCheckout_${planSlug}`, payload);
  if (planSlug === "premium") recordFunnelEvent("InitiateCheckout_premium", payload);
}

export function SubscribeButton({ planSlug, label, className }: SubscribeButtonProps) {
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    setLoading(true);

    if (planSlug === "free") {
      window.location.assign("/login?redirect=%2Fassinar%3Fplan%3Dfree");
      return;
    }

    trackInitiateCheckout(planSlug);

    const checkoutUrl = new URL("/api/billing/checkout", window.location.origin);
    checkoutUrl.searchParams.set("plan", planSlug);
    const attribution = readAttributionParams();
    attribution.forEach((value, key) => checkoutUrl.searchParams.set(key, value));

    window.location.assign(checkoutUrl.toString());
  };

  return (
    <button type="button" onClick={onClick} disabled={loading} className={className}>
      {loading ? "Redirecionando..." : label}
    </button>
  );
}
