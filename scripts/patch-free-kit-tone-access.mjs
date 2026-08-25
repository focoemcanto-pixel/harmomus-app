import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const MARKER = "free_tone_access";

function patch(relPath, mutate) {
  const filePath = path.join(root, relPath);
  const source = fs.readFileSync(filePath, "utf8");
  const next = mutate(source);
  if (next === source) {
    console.log(`[free-tone-access] no changes: ${relPath}`);
    return;
  }
  fs.writeFileSync(filePath, next, "utf8");
  console.log(`[free-tone-access] patched: ${relPath}`);
}

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`[free-tone-access] anchor not found: ${label}`);
  return source.replace(search, replacement);
}

patch("src/components/admin/kit-form.tsx", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    '    allow_pitch_shift: formData.has("allow_pitch_shift"),\n    published: formData.has("published"),',
    '    allow_pitch_shift: formData.has("allow_pitch_shift"),\n    free_tone_access: formData.has("free_tone_access"),\n    published: formData.has("published"),',
    "kit-form payload",
  );

  next = replaceOnce(
    next,
    '            <label className="flex items-center gap-2 text-sm text-muted">\n              <input name="allow_pitch_shift" type="checkbox" defaultChecked={toneInitialData?.allow_pitch_shift ?? true} className="h-4 w-4 rounded border-border bg-surface-muted" />\n              Permitir modulação inteligente\n            </label>',
    '            <label className="flex items-center gap-2 text-sm text-muted">\n              <input name="allow_pitch_shift" type="checkbox" defaultChecked={toneInitialData?.allow_pitch_shift ?? true} className="h-4 w-4 rounded border-border bg-surface-muted" />\n              Permitir modulação inteligente\n            </label>\n            <label className="flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-muted">\n              <input\n                name="free_tone_access"\n                type="checkbox"\n                defaultChecked={Array.isArray((initialData as any)?.allowed_plan_slugs) && (initialData as any).allowed_plan_slugs.includes("free_tone_access")}\n                className="mt-0.5 h-4 w-4 rounded border-border bg-surface-muted"\n              />\n              <span>\n                <strong className="block text-foreground">Liberar troca de tom para usuários Free</strong>\n                <span className="mt-1 block text-xs text-muted">Use quando liberar este kit para estudo e quiser permitir que usuários gratuitos escolham outros tons disponíveis.</span>\n              </span>\n            </label>',
    "kit-form free tone checkbox",
  );
  return next;
});

patch("src/app/api/admin/kits/[id]/route.ts", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    '    const allowedPlanSlugs = parseAllowedPlanSlugs(body.allowed_plan_slugs);\n\n    if (!name || !slug || !artist) {',
    '    const allowedPlanSlugs = parseAllowedPlanSlugs(body.allowed_plan_slugs);\n    const freeToneAccess = Boolean(body.free_tone_access) && allowedPlanSlugs.includes("free");\n    const persistedAllowedPlanSlugs = freeToneAccess\n      ? Array.from(new Set([...allowedPlanSlugs.filter((slug) => slug !== "free_tone_access"), "free_tone_access"]))\n      : allowedPlanSlugs.filter((slug) => slug !== "free_tone_access");\n\n    if (!name || !slug || !artist) {',
    "admin kit free tone persistence",
  );
  next = replaceOnce(
    next,
    '      required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n      allowed_plan_slugs: allowedPlanSlugs,',
    '      required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n      allowed_plan_slugs: persistedAllowedPlanSlugs,',
    "admin kit persisted plans",
  );
  return next;
});

patch("src/app/admin/kits/novo/page.tsx", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    '    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));\n\n    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");',
    '    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));\n    const freeToneAccess = formData.has("free_tone_access") && allowedPlanSlugs.includes("free");\n    const persistedAllowedPlanSlugs = freeToneAccess ? [...allowedPlanSlugs, "free_tone_access"] : allowedPlanSlugs;\n\n    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");',
    "new kit free tone persistence",
  );
  next = replaceOnce(
    next,
    '      allowed_plan_slugs: allowedPlanSlugs,\n      published: formData.get("published") === "on",',
    '      allowed_plan_slugs: persistedAllowedPlanSlugs,\n      published: formData.get("published") === "on",',
    "new kit persisted plans",
  );

  const updateAnchor = '    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));\n\n    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");';
  const updateReplacement = '    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));\n    const freeToneAccess = formData.has("free_tone_access") && allowedPlanSlugs.includes("free");\n    const persistedAllowedPlanSlugs = freeToneAccess ? [...allowedPlanSlugs, "free_tone_access"] : allowedPlanSlugs;\n\n    if (!name || !slug || !artist) throw new Error("Preencha nome, slug e artista para continuar.");';
  if (next.includes(updateAnchor)) next = next.replace(updateAnchor, updateReplacement);

  const updatePlansAnchor = '      required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n      allowed_plan_slugs: allowedPlanSlugs,\n      original_tone: originalTone || null,';
  const updatePlansReplacement = '      required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n      allowed_plan_slugs: persistedAllowedPlanSlugs,\n      original_tone: originalTone || null,';
  if (next.includes(updatePlansAnchor)) next = next.replace(updatePlansAnchor, updatePlansReplacement);
  return next;
});

patch("src/lib/data/public-kits.ts", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    '  allowPitchShift: boolean;\n  maxPitchShiftSemitones: number;',
    '  allowPitchShift: boolean;\n  allowFreeToneChange?: boolean;\n  maxPitchShiftSemitones: number;',
    "PublicKit free tone field",
  );

  next = replaceOnce(
    next,
    '  const requiredPlan = resolveRequiredPlan(kit, plansMap);\n  const allowedPlanSlugs: string[] = Array.isArray((kit as any).allowed_plan_slugs) && (kit as any).allowed_plan_slugs.length\n    ? Array.from(new Set(((kit as any).allowed_plan_slugs as unknown[]).map((slug) => normalizePlan(slug))))',
    '  const requiredPlan = resolveRequiredPlan(kit, plansMap);\n  const rawAllowedPlanSlugs = Array.isArray((kit as any).allowed_plan_slugs) ? ((kit as any).allowed_plan_slugs as unknown[]).map((slug) => String(slug).trim().toLowerCase()) : [];\n  const allowFreeToneChange = rawAllowedPlanSlugs.includes("free_tone_access") && rawAllowedPlanSlugs.includes("free");\n  const allowedPlanSlugs: string[] = rawAllowedPlanSlugs.length\n    ? Array.from(new Set(rawAllowedPlanSlugs.filter((slug) => slug !== "free_tone_access").map((slug) => normalizePlan(slug))))',
    "public kit marker mapping",
  );

  next = replaceOnce(
    next,
    '    allowPitchShift: kit.allow_pitch_shift ?? true,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,',
    '    allowPitchShift: kit.allow_pitch_shift ?? true,\n    allowFreeToneChange,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,',
    "public kit return field",
  );
  return next;
});

patch("src/lib/access/access-rules.ts", (source) => {
  let next = source;
  next = replaceOnce(
    next,
    'export function canChangeTone(context: CurrentUserAccessContext, canPlay: boolean) {\n  if (!canPlay) return { allowed: false, reason: "cannot_play" as const };\n  if (canUsePitchShift(context.effectiveSlug)) return { allowed: true, reason: "ok" as const };\n  return { allowed: false, reason: "upgrade_required" as const };\n}\n\nexport async function resolveKitAccess(context: CurrentUserAccessContext, kit: PublicKit) {\n  const play = await canPlayAudio(context, kit);\n  const tone = canChangeTone(context, play.allowed);',
    'export function canChangeTone(context: CurrentUserAccessContext, canPlay: boolean, kit?: PublicKit | null) {\n  if (!canPlay) return { allowed: false, reason: "cannot_play" as const };\n  if (canUsePitchShift(context.effectiveSlug)) return { allowed: true, reason: "ok" as const };\n  if (context.effectiveSlug === "free" && kit?.allowFreeToneChange) return { allowed: true, reason: "kit_free_tone_access" as const };\n  return { allowed: false, reason: "upgrade_required" as const };\n}\n\nexport async function resolveKitAccess(context: CurrentUserAccessContext, kit: PublicKit) {\n  const play = await canPlayAudio(context, kit);\n  const tone = canChangeTone(context, play.allowed, kit);',
    "access rule free tone exception",
  );
  return next;
});

for (const relPath of [
  "src/app/api/audio/[id]/route.ts",
  "src/app/api/audio/[id]/signed/route.ts",
  "src/app/api/audio/[id]/signed-url/route.ts",
]) {
  patch(relPath, (source) => {
    let next = source;
    const fieldAnchor = '    allowPitchShift: kit.allow_pitch_shift ?? true,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,';
    const fieldReplacement = '    allowPitchShift: kit.allow_pitch_shift ?? true,\n    allowFreeToneChange: Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.includes("free") && kit.allowed_plan_slugs.includes("free_tone_access"),\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,';
    next = replaceOnce(next, fieldAnchor, fieldReplacement, `${relPath} access kit field`);
    return next;
  });
}

console.log(`[free-tone-access] done (${MARKER})`);
