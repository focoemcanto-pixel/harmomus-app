"use client";

import { useEffect } from "react";

const STORAGE_KEY = "harmomus_attribution";
const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"] as const;

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

function buildCleanUrl(url: URL) {
  const clean = new URL(url.href);
  for (const key of TRACKING_KEYS) clean.searchParams.delete(key);
  const query = clean.searchParams.toString();
  return `${clean.pathname}${query ? `?${query}` : ""}${clean.hash}`;
}

export function AttributionCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const params = url.searchParams;
    if (!hasTrackingParams(params)) return;

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
    window.history.replaceState(window.history.state, document.title, buildCleanUrl(url));
  }, []);

  return null;
}
