"use client";

import { useEffect } from "react";

const STORAGE_KEY = "harmomus_attribution";
const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;
const FUNNEL_KEYS = ["meta_complete_registration"] as const;

function readStoredAttribution() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function hasTrackingParams(searchParams: URLSearchParams) {
  return TRACKING_KEYS.some((key) => Boolean(searchParams.get(key)));
}

function hasFunnelParams(searchParams: URLSearchParams) {
  return FUNNEL_KEYS.some((key) => searchParams.get(key) === "1");
}

function buildCleanUrl(url: URL) {
  const clean = new URL(url.href);
  for (const key of TRACKING_KEYS) clean.searchParams.delete(key);
  for (const key of FUNNEL_KEYS) clean.searchParams.delete(key);
  const query = clean.searchParams.toString();
  return `${clean.pathname}${query ? `?${query}` : ""}${clean.hash}`;
}

function recordFunnelEvent(eventName: string, payload: Record<string, unknown>, eventId: string) {
  fetch("/api/meta-events/record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ eventName, payload, eventId, url: window.location.href }),
    keepalive: true,
  }).catch(() => undefined);
}

function trackCompleteRegistration(searchParams: URLSearchParams) {
  if (searchParams.get("meta_complete_registration") !== "1") return;

  const storageKey = "meta_funnel_CompleteRegistration_first_login";
  if (window.localStorage.getItem(storageKey)) return;

  const fbq = (window as any).fbq;
  if (typeof fbq !== "function") return;

  const attribution = readStoredAttribution();
  const payload = {
    content_name: "Harmomus First Login",
    content_category: "subscription_signup",
    plan: "free",
    ...attribution,
  };

  fbq("track", "CompleteRegistration", payload);
  fbq("trackCustom", "CompleteRegistration_first_login", payload);
  recordFunnelEvent("CompleteRegistration_first_login", payload, storageKey);
  window.localStorage.setItem(storageKey, new Date().toISOString());
}

export function AttributionCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const params = url.searchParams;
    const shouldCaptureAttribution = hasTrackingParams(params);
    const shouldCleanFunnel = hasFunnelParams(params);

    if (shouldCaptureAttribution) {
      const captured: Record<string, string> = {};
      for (const key of TRACKING_KEYS) {
        const value = params.get(key);
        if (value) captured[key] = value.slice(0, 500);
      }

      const previous = readStoredAttribution();
      const now = new Date().toISOString();
      const payload = {
        ...previous,
        ...captured,
        first_url: previous.first_url || window.location.href,
        landing_page: previous.landing_page || window.location.pathname,
        last_url: window.location.href,
        updated_at: now,
      };

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }

    trackCompleteRegistration(params);

    if (shouldCaptureAttribution || shouldCleanFunnel) {
      window.history.replaceState(window.history.state, document.title, buildCleanUrl(url));
    }
  }, []);

  return null;
}
