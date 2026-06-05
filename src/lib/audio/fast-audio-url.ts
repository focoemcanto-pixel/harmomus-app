export function resolveFastAudioUrl(src: string | null | undefined) {
  const value = String(src ?? "").trim();
  if (!value) return "";
  if (value.includes("/signed")) return value;

  const match = value.match(/^\/api\/audio\/([^/?#]+)([?#].*)?$/);
  if (!match?.[1]) return value;

  return `/api/audio/${match[1]}/signed${match[2] ?? ""}`;
}
