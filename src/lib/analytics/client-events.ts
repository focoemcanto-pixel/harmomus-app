export function trackClientEvent(eventName: string, metadata?: Record<string, unknown>) {
  if (typeof window === "undefined") return;

  try {
    window.dispatchEvent(
      new CustomEvent("harmomus:client-event", {
        detail: {
          eventName,
          metadata,
          at: new Date().toISOString(),
        },
      }),
    );
  } catch {}
}
