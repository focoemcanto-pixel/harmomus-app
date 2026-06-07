export const OFFICIAL_PLAN_PRICES_CENTS: Record<string, number> = {
  plus: 1900,
  premium: 3900,
  ministry_10: 39700,
  ministry_20: 69700,
  ministry_40: 129700,
};

export const OFFICIAL_PLAN_NAMES: Record<string, string> = {
  plus: "Plus",
  premium: "Premium",
  ministry_10: "Ministerial 10",
  ministry_20: "Ministerial 20",
  ministry_40: "Ministerial 40",
};

export function resolveBillablePriceCents(slug?: string | null, priceCents?: number | null) {
  const normalizedSlug = String(slug ?? "").trim().toLowerCase();
  const storedPrice = Number(priceCents ?? 0);
  if (Number.isFinite(storedPrice) && storedPrice > 0) return Math.round(storedPrice);
  return OFFICIAL_PLAN_PRICES_CENTS[normalizedSlug] ?? 0;
}

export function resolvePlanDisplayName(slug?: string | null, name?: string | null) {
  const normalizedName = String(name ?? "").trim();
  if (normalizedName) return normalizedName;
  return OFFICIAL_PLAN_NAMES[String(slug ?? "").trim().toLowerCase()] ?? "Premium";
}
