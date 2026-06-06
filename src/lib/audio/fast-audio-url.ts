export function resolveFastAudioUrl(src: string | null | undefined) {
  const value = String(src ?? "").trim();
  if (!value) return "";

  // A rota oficial de streaming já aplica autenticação, regra de plano,
  // range requests e headers corretos. Não reescreva para /signed,
  // pois essa rota não é o endpoint público do player e causa 403/405.
  return value;
}
