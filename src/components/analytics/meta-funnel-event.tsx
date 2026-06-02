"use client";

import { useEffect } from "react";

type MetaFunnelEventProps = {
  eventName: "Lead" | "CompleteRegistration";
  dedupeKey: string;
  params?: Record<string, unknown>;
  customEventName?: string;
};

function readAttribution() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem("harmomus_attribution") || "{}");
  } catch {
    return {};
  }
}

export function MetaFunnelEvent({ eventName, dedupeKey, params, customEventName }: MetaFunnelEventProps) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storageKey = `meta_funnel_${eventName}_${dedupeKey}`;
    if (window.localStorage.getItem(storageKey)) return;

    const fbq = (window as any).fbq;
    if (typeof fbq !== "function") return;

    const attribution = readAttribution();
    const payload = {
      content_name: "Harmomus",
      content_category: "subscription_signup",
      ...attribution,
      ...params,
    };

    fbq("track", eventName, payload);
    if (customEventName) fbq("trackCustom", customEventName, payload);
    window.localStorage.setItem(storageKey, new Date().toISOString());
  }, [eventName, dedupeKey, params, customEventName]);

  return null;
}
