function assertServerRuntime() {
  if (typeof window !== "undefined") {
    throw new Error("As URLs confiáveis da aplicação só podem ser resolvidas no servidor.");
  }
}

function normalizeConfiguredOrigin(value: string | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getTrustedAppOrigin(request?: Request) {
  assertServerRuntime();

  const configured =
    normalizeConfiguredOrigin(process.env.APP_URL) ??
    normalizeConfiguredOrigin(process.env.NEXT_PUBLIC_APP_URL);

  if (configured) return configured;

  if (process.env.NODE_ENV !== "production" && request) {
    return new URL(request.url).origin;
  }

  throw new Error("Configuração ausente: APP_URL ou NEXT_PUBLIC_APP_URL deve definir a origem oficial da aplicação.");
}

export function trustedAppUrl(pathname: string, request?: Request) {
  return new URL(pathname, getTrustedAppOrigin(request));
}
