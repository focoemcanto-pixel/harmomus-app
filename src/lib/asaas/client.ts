export const ASAAS_BASE =
  process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";

const DEFAULT_TIMEOUT_MS = 15_000;

type AsaasFetchOptions = Omit<RequestInit, "body" | "headers"> & {
  body?: unknown;
  headers?: HeadersInit;
  timeoutMs?: number;
};

type AsaasErrorItem = {
  code?: string;
  description?: string;
};

type AsaasErrorPayload = {
  errors?: AsaasErrorItem[];
  error?: string;
  message?: string;
};

function resolveApiKey() {
  const apiKey = process.env.ASAAS_API_KEY?.trim();
  if (!apiKey) throw new Error("Configuração ausente: ASAAS_API_KEY.");
  return apiKey;
}

function buildUrl(path: string) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ASAAS_BASE}${normalizedPath}`;
}

function describeAsaasError(status: number, payload: unknown) {
  const parsed = payload as AsaasErrorPayload | null;
  const details = parsed?.errors
    ?.map((item) => item.description || item.code)
    .filter(Boolean)
    .join("; ");

  return details || parsed?.message || parsed?.error || `Erro Asaas ${status}`;
}

export async function asaasFetch<T>(path: string, options: AsaasFetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers = new Headers(options.headers);
  headers.set("access_token", resolveApiKey());
  headers.set("accept", "application/json");
  headers.set("user-agent", "Harmomus/1.0");

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(buildUrl(path), {
      ...options,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) as unknown : null;

    if (!response.ok) {
      throw new Error(describeAsaasError(response.status, payload));
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tempo esgotado ao conectar com o Asaas.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
