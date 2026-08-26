import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const POLICY_PREFIX = "free_access_";

function patch(relPath, mutate) {
  const filePath = path.join(root, relPath);
  const source = fs.readFileSync(filePath, "utf8");
  const next = mutate(source);
  if (next === source) {
    console.log(`[free-access-policy] no changes: ${relPath}`);
    return;
  }
  fs.writeFileSync(filePath, next, "utf8");
  console.log(`[free-access-policy] patched: ${relPath}`);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[free-access-policy] anchor not found: ${label}`);
  return source.replace(search, replacement);
}

function replaceAllRequired(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[free-access-policy] anchor not found: ${label}`);
  return source.split(search).join(replacement);
}

function applyHelperSource() {
  return `function applyFreeAccessOverrideMarkers(allowedPlanSlugs: string[], modeValue: unknown, limitValue: unknown) {\n  const base = allowedPlanSlugs.filter((slug) => !String(slug).startsWith("${POLICY_PREFIX}"));\n  if (!base.includes("free")) return base;\n\n  const mode = String(modeValue ?? "default").trim().toLowerCase();\n  if (mode === "unlimited") return Array.from(new Set([...base, "free_access_unlimited"]));\n\n  if (mode === "custom") {\n    const parsed = Number(limitValue ?? 3);\n    const limit = Math.max(1, Math.min(999, Number.isFinite(parsed) ? Math.round(parsed) : 3));\n    return Array.from(new Set([...base, \`free_access_limit_\${limit}\`]));\n  }\n\n  return base;\n}\n`;
}

function injectPolicyHelper(source, label) {
  if (source.includes("function applyFreeAccessOverrideMarkers(")) return source;
  const anchor = `function resolveLegacyRequiredPlan(allowedPlanSlugs: string[]) {\n  if (allowedPlanSlugs.includes("free")) return null;\n  if (allowedPlanSlugs.includes("plus")) return "plus";\n  if (allowedPlanSlugs.includes("premium")) return "premium";\n  return null;\n}\n`;
  if (!source.includes(anchor)) throw new Error(`[free-access-policy] helper anchor not found: ${label}`);
  return source.replace(anchor, `${anchor}\n${applyHelperSource()}`);
}

patch("src/components/admin/kit-form.tsx", (source) => {
  let next = source;

  next = replaceOnce(
    next,
    '    free_tone_access: formData.has("free_tone_access"),\n    published: formData.has("published"),',
    '    free_tone_access: formData.has("free_tone_access"),\n    free_access_mode: String(formData.get("free_access_mode") ?? "default"),\n    free_access_limit: String(formData.get("free_access_limit") ?? "3"),\n    published: formData.has("published"),',
    "kit form payload",
  );

  const freeToneBlock = `            <label className="flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-muted">\n              <input\n                name="free_tone_access"\n                type="checkbox"\n                defaultChecked={Array.isArray((initialData as any)?.allowed_plan_slugs) && (initialData as any).allowed_plan_slugs.includes("free_tone_access")}\n                className="mt-0.5 h-4 w-4 rounded border-border bg-surface-muted"\n              />\n              <span>\n                <strong className="block text-foreground">Liberar troca de tom para usuários Free</strong>\n                <span className="mt-1 block text-xs text-muted">Use quando liberar este kit para estudo e quiser permitir que usuários gratuitos escolham outros tons disponíveis.</span>\n              </span>\n            </label>`;

  const policyBlock = `${freeToneBlock}\n            <div className="rounded-lg border border-sky-400/20 bg-sky-500/5 p-3 md:col-span-2">\n              <div className="mb-3">\n                <strong className="block text-sm text-foreground">Acessos Free deste kit</strong>\n                <span className="mt-1 block text-xs text-muted">Defina se este kit usa a cota geral de 3 visitas em 24h ou possui uma regra própria.</span>\n              </div>\n              <div className="grid gap-3 md:grid-cols-2">\n                <label className="space-y-2 text-sm">\n                  <span className="text-muted">Regra de acesso</span>\n                  <select\n                    name="free_access_mode"\n                    defaultValue={(() => {\n                      const slugs = Array.isArray((initialData as any)?.allowed_plan_slugs) ? (initialData as any).allowed_plan_slugs.map((value: unknown) => String(value)) : [];\n                      if (slugs.includes("free_access_unlimited")) return "unlimited";\n                      if (slugs.some((slug: string) => slug.startsWith("free_access_limit_"))) return "custom";\n                      return "default";\n                    })()}\n                    className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2"\n                  >\n                    <option value="default">Padrão do plano — 3 visitas em 24h</option>\n                    <option value="unlimited">Acesso ilimitado a este kit</option>\n                    <option value="custom">Limite próprio para este kit</option>\n                  </select>\n                </label>\n                <label className="space-y-2 text-sm">\n                  <span className="text-muted">Quantidade em 24h</span>\n                  <input\n                    name="free_access_limit"\n                    type="number"\n                    min="1"\n                    max="999"\n                    defaultValue={(() => {\n                      const slugs = Array.isArray((initialData as any)?.allowed_plan_slugs) ? (initialData as any).allowed_plan_slugs.map((value: unknown) => String(value)) : [];\n                      const marker = slugs.find((slug: string) => slug.startsWith("free_access_limit_"));\n                      const parsed = marker ? Number(marker.replace("free_access_limit_", "")) : 3;\n                      return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;\n                    })()}\n                    className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2"\n                  />\n                  <p className="text-xs text-muted">Usado somente quando “Limite próprio” estiver selecionado.</p>\n                </label>\n              </div>\n            </div>`;

  next = replaceOnce(next, freeToneBlock, policyBlock, "kit form policy controls");
  return next;
});

patch("src/app/api/admin/kits/[id]/route.ts", (source) => {
  let next = injectPolicyHelper(source, "api admin kit");
  next = replaceOnce(
    next,
    "      allowed_plan_slugs: persistedAllowedPlanSlugs,",
    "      allowed_plan_slugs: applyFreeAccessOverrideMarkers(persistedAllowedPlanSlugs, body.free_access_mode, body.free_access_limit),",
    "api persisted policy",
  );
  return next;
});

patch("src/app/admin/kits/novo/page.tsx", (source) => {
  let next = injectPolicyHelper(source, "new kit page");
  next = replaceAllRequired(
    next,
    "      allowed_plan_slugs: persistedAllowedPlanSlugs,",
    '      allowed_plan_slugs: applyFreeAccessOverrideMarkers(persistedAllowedPlanSlugs, formData.get("free_access_mode"), formData.get("free_access_limit")),',
    "new/imported persisted policy",
  );
  return next;
});

patch("src/app/admin/kits/[id]/editar/page.tsx", (source) => {
  let next = injectPolicyHelper(source, "edit kit page");
  next = replaceOnce(
    next,
    "        allowed_plan_slugs: persistedAllowedPlanSlugs,",
    '        allowed_plan_slugs: applyFreeAccessOverrideMarkers(persistedAllowedPlanSlugs, formData.get("free_access_mode"), formData.get("free_access_limit")),',
    "edit persisted policy",
  );
  return next;
});

patch("src/lib/data/public-kits.ts", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    "  allowFreeToneChange?: boolean;\n  maxPitchShiftSemitones: number;",
    '  allowFreeToneChange?: boolean;\n  freeAccessMode?: "default" | "unlimited" | "custom";\n  freeAccessLimit?: number | null;\n  maxPitchShiftSemitones: number;',
    "public kit policy fields",
  );

  next = replaceOnce(
    next,
    '  const allowFreeToneChange = rawAllowedPlanSlugs.includes("free_tone_access") && rawAllowedPlanSlugs.includes("free");\n  const allowedPlanSlugs: string[] = rawAllowedPlanSlugs.length',
    '  const allowFreeToneChange = rawAllowedPlanSlugs.includes("free_tone_access") && rawAllowedPlanSlugs.includes("free");\n  const freeAccessLimitMarker = rawAllowedPlanSlugs.find((slug) => slug.startsWith("free_access_limit_"));\n  const parsedFreeAccessLimit = freeAccessLimitMarker ? Number(freeAccessLimitMarker.replace("free_access_limit_", "")) : null;\n  const freeAccessMode: "default" | "unlimited" | "custom" = rawAllowedPlanSlugs.includes("free_access_unlimited")\n    ? "unlimited"\n    : typeof parsedFreeAccessLimit === "number" && Number.isFinite(parsedFreeAccessLimit) && parsedFreeAccessLimit > 0\n      ? "custom"\n      : "default";\n  const freeAccessLimit = freeAccessMode === "custom" ? Math.max(1, Math.min(999, Math.round(parsedFreeAccessLimit as number))) : null;\n  const allowedPlanSlugs: string[] = rawAllowedPlanSlugs.length',
    "public kit policy parsing",
  );

  next = replaceOnce(
    next,
    '.filter((slug) => slug !== "free_tone_access").map((slug) => normalizePlan(slug))',
    '.filter((slug) => slug !== "free_tone_access" && !slug.startsWith("free_access_")).map((slug) => normalizePlan(slug))',
    "public kit policy filtering",
  );

  next = replaceOnce(
    next,
    "    allowFreeToneChange,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,",
    "    allowFreeToneChange,\n    freeAccessMode,\n    freeAccessLimit,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,",
    "public kit policy return",
  );
  return next;
});

patch("src/lib/access/access-rules.ts", (source) => {
  let next = source;

  next = replaceOnce(
    next,
    "  nextResetAt: string;\n}",
    '  nextResetAt: string;\n  mode?: "default" | "unlimited" | "custom";\n  kitAccessCount?: number;\n  kitLimit?: number | null;\n  unlimited?: boolean;\n}',
    "stats policy fields",
  );

  const accessBlockStart = next.indexOf("export async function getFreeAccessStats");
  const accessBlockEnd = next.indexOf("function kitAllowsFree", accessBlockStart);
  if (accessBlockStart < 0 || accessBlockEnd < 0) throw new Error("[free-access-policy] access stats block not found");

  const accessBlock = `let specialKitIdsCache: { expiresAt: number; ids: Set<string> } | null = null;\n\nasync function getSpecialFreeAccessKitIds() {\n  const now = Date.now();\n  if (specialKitIdsCache && specialKitIdsCache.expiresAt > now) return specialKitIdsCache.ids;\n\n  const supabase = createSupabaseAdminClient() as any;\n  const { data, error } = await supabase.from("kits").select("id,allowed_plan_slugs");\n  if (error) {\n    console.error("[access-rules] Could not load kit access policies", error);\n    return new Set<string>();\n  }\n\n  const ids = new Set<string>();\n  for (const row of data ?? []) {\n    const slugs = Array.isArray(row.allowed_plan_slugs) ? row.allowed_plan_slugs.map((value: unknown) => String(value).trim().toLowerCase()) : [];\n    if (!slugs.includes("free")) continue;\n    if (slugs.includes("free_access_unlimited") || slugs.some((slug: string) => slug.startsWith("free_access_limit_"))) ids.add(String(row.id));\n  }\n\n  specialKitIdsCache = { ids, expiresAt: now + 30_000 };\n  return ids;\n}\n\nexport async function getFreeAccessStats(userId: string): Promise<FreeAccessStats> {\n  const supabase = createSupabaseAdminClient() as any;\n  const { start, nextResetAt } = getAccessWindow();\n  const [specialKitIds, logsResult] = await Promise.all([\n    getSpecialFreeAccessKitIds(),\n    supabase\n      .from("kit_access_logs")\n      .select("kit_id")\n      .eq("user_id", userId)\n      .gte("accessed_at", start)\n      .not("kit_id", "is", null),\n  ]);\n\n  if (logsResult.error) {\n    console.error("[access-rules] Could not load kit access logs", { userId, error: logsResult.error });\n  }\n\n  const accessCountToday = (logsResult.data ?? []).filter((row: { kit_id?: string | null }) => row.kit_id && !specialKitIds.has(String(row.kit_id))).length;\n  const summary = summarizeAccessCount(accessCountToday, FREE_LIMIT);\n  return { ...summary, limit: FREE_LIMIT, nextResetAt, mode: "default" };\n}\n\nasync function getKitAccessCount(userId: string, kitId: string) {\n  const supabase = createSupabaseAdminClient() as any;\n  const { start } = getAccessWindow();\n  const { count, error } = await supabase\n    .from("kit_access_logs")\n    .select("*", { count: "exact", head: true })\n    .eq("user_id", userId)\n    .eq("kit_id", kitId)\n    .gte("accessed_at", start);\n  if (error) console.error("[access-rules] Could not load per-kit access logs", { userId, kitId, error });\n  return count ?? 0;\n}\n\nfunction enrichStatsForKit(stats: FreeAccessStats, kit: PublicKit, kitAccessCount = 0): FreeAccessStats {\n  if (kit.freeAccessMode === "unlimited") return { ...stats, mode: "unlimited", unlimited: true, kitAccessCount, kitLimit: null };\n  if (kit.freeAccessMode === "custom" && typeof kit.freeAccessLimit === "number") {\n    return { ...stats, mode: "custom", unlimited: false, kitAccessCount, kitLimit: kit.freeAccessLimit };\n  }\n  return { ...stats, mode: "default", unlimited: false };\n}\n\nexport async function registerKitAccess(userId: string, kit: PublicKit): Promise<FreeAccessStats> {\n  const supabase = createSupabaseAdminClient() as any;\n  const normalizedKitId = String(kit?.id ?? "").trim();\n  const stats = await getFreeAccessStats(userId);\n  if (!normalizedKitId) return stats;\n\n  if (kit.freeAccessMode === "custom" && typeof kit.freeAccessLimit === "number") {\n    const count = await getKitAccessCount(userId, normalizedKitId);\n    if (count >= kit.freeAccessLimit) return enrichStatsForKit(stats, kit, count);\n    const { error } = await supabase.from("kit_access_logs").insert({ user_id: userId, kit_id: normalizedKitId });\n    if (error) {\n      console.error("[access-rules] Could not register custom kit access", { userId, kitId: normalizedKitId, error });\n      return enrichStatsForKit(stats, kit, count);\n    }\n    return enrichStatsForKit(stats, kit, count + 1);\n  }\n\n  if (kit.freeAccessMode === "unlimited") {\n    const { error } = await supabase.from("kit_access_logs").insert({ user_id: userId, kit_id: normalizedKitId });\n    if (error) console.error("[access-rules] Could not register unlimited kit access", { userId, kitId: normalizedKitId, error });\n    return enrichStatsForKit(stats, kit);\n  }\n\n  if (stats.accessCountToday >= FREE_LIMIT) return stats;\n  const { error: insertError } = await supabase.from("kit_access_logs").insert({ user_id: userId, kit_id: normalizedKitId });\n  if (insertError) {\n    console.error("[access-rules] Could not register kit access", { userId, kitId: normalizedKitId, error: insertError });\n    return stats;\n  }\n  return getFreeAccessStats(userId);\n}\n\n`;

  next = next.slice(0, accessBlockStart) + accessBlock + next.slice(accessBlockEnd);

  const playStart = next.indexOf("export async function canPlayAudio");
  const playEnd = next.indexOf("export function canChangeTone", playStart);
  if (playStart < 0 || playEnd < 0) throw new Error("[free-access-policy] canPlayAudio block not found");

  const playBlock = `export async function canPlayAudio(context: CurrentUserAccessContext, kit: PublicKit) {\n  if (context.isGuest) return { allowed: false, reason: "guest" as const };\n\n  if (context.effectiveSlug === "free" && context.profile) {\n    if (!canAccessKit(context.effectiveSlug, kit.allowedPlanSlugs)) {\n      const requiredPlan = resolveMinimumPlan(kit);\n      return { allowed: false, reason: "plan_hierarchy" as const, requiredPlan };\n    }\n\n    const stats = await getFreeAccessStats(context.profile.id);\n\n    if (kitAllowsFree(kit) && kit.freeAccessMode === "unlimited") {\n      return { allowed: true, reason: "ok" as const, stats: enrichStatsForKit(stats, kit) };\n    }\n\n    if (kitAllowsFree(kit) && kit.freeAccessMode === "custom" && typeof kit.freeAccessLimit === "number") {\n      const kitAccessCount = await getKitAccessCount(context.profile.id, kit.id);\n      const kitStats = enrichStatsForKit(stats, kit, kitAccessCount);\n      if (kitAccessCount >= kit.freeAccessLimit) return { allowed: false, reason: "kit_free_limit" as const, stats: kitStats };\n      return { allowed: true, reason: "ok" as const, stats: kitStats };\n    }\n\n    const dailyLimit = getDailyKitLimit(context.effectiveSlug) ?? FREE_LIMIT;\n    if (kitAllowsFree(kit) && stats.accessCountToday >= dailyLimit) {\n      return { allowed: false, reason: "free_limit" as const, stats: { ...stats, limit: dailyLimit } };\n    }\n\n    return { allowed: true, reason: "ok" as const, stats: { ...stats, limit: dailyLimit } };\n  }\n\n  if (!canAccessKit(context.effectiveSlug, kit.allowedPlanSlugs)) {\n    const requiredPlan = resolveMinimumPlan(kit);\n    return { allowed: false, reason: "plan_hierarchy" as const, requiredPlan };\n  }\n\n  return { allowed: true, reason: "ok" as const };\n}\n\n`;

  next = next.slice(0, playStart) + playBlock + next.slice(playEnd);
  return next;
});

patch("src/app/api/kits/[id]/access/route.ts", (source) => {
  return replaceOnce(
    source,
    "  const stats = await registerKitAccess(current.profile.id, kit.id);",
    "  const stats = await registerKitAccess(current.profile.id, kit);",
    "register kit policy",
  );
});

for (const relPath of [
  "src/app/api/audio/[id]/route.ts",
  "src/app/api/audio/[id]/signed/route.ts",
  "src/app/api/audio/[id]/signed-url/route.ts",
]) {
  patch(relPath, (source) => {
    const markerLine = '    allowFreeToneChange: Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.includes("free") && kit.allowed_plan_slugs.includes("free_tone_access"),';
    const replacement = `${markerLine}\n    freeAccessMode: Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.includes("free_access_unlimited") ? "unlimited" : Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.some((slug) => String(slug).startsWith("free_access_limit_")) ? "custom" : "default",\n    freeAccessLimit: (() => {\n      const marker = Array.isArray(kit.allowed_plan_slugs) ? kit.allowed_plan_slugs.find((slug) => String(slug).startsWith("free_access_limit_")) : null;\n      const parsed = marker ? Number(String(marker).replace("free_access_limit_", "")) : null;\n      return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.min(999, Math.round(parsed))) : null;\n    })(),`;
    return replaceOnce(source, markerLine, replacement, `${relPath} policy fields`);
  });
}

patch("src/components/public/access-counter.tsx", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    "  nextResetAt?: string;\n}",
    '  nextResetAt?: string;\n  mode?: "default" | "unlimited" | "custom";\n  kitAccessCount?: number;\n  kitLimit?: number | null;\n  unlimited?: boolean;\n}',
    "counter stats fields",
  );

  next = replaceOnce(
    next,
    "export function AccessCounter({ value, limit, stats }: AccessCounterProps) {\n  const resolvedLimit = limit ?? stats?.limit ?? 0;",
    'export function AccessCounter({ value, limit, stats }: AccessCounterProps) {\n  if (stats?.mode === "unlimited" || stats?.unlimited) {\n    return <p className="text-xs text-emerald-300">Acesso ilimitado a este kit.</p>;\n  }\n\n  if (stats?.mode === "custom" && typeof stats?.kitLimit === "number") {\n    const used = Math.max(0, Number(stats.kitAccessCount) || 0);\n    const kitLimit = Math.max(1, Number(stats.kitLimit) || 1);\n    return <p className="text-xs text-muted">Visitas deste kit (24h): {Math.min(used, kitLimit)}/{kitLimit}</p>;\n  }\n\n  const resolvedLimit = limit ?? stats?.limit ?? 0;',
    "counter policy display",
  );
  return next;
});

console.log("[free-access-policy] done");
