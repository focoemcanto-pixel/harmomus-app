import fs from "node:fs";
import path from "node:path";

const relPath = "src/app/admin/kits/[id]/editar/page.tsx";
const filePath = path.join(process.cwd(), relPath);
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`[free-tone-editor] anchor not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  '    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));\n\n    if (!name || !slug || !artist) {',
  '    const allowedPlanSlugs = parseAllowedPlanSlugs(formData, plans.map((plan) => plan.slug));\n    const freeToneAccess = formData.has("free_tone_access") && allowedPlanSlugs.includes("free");\n    const persistedAllowedPlanSlugs = freeToneAccess\n      ? Array.from(new Set([...allowedPlanSlugs, "free_tone_access"]))\n      : allowedPlanSlugs.filter((slug) => slug !== "free_tone_access");\n\n    if (!name || !slug || !artist) {',
  "persist marker",
);

const legacySave = '        required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n        allowed_plan_slugs: allowedPlanSlugs,';
const persistedSave = '        required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n        allowed_plan_slugs: persistedAllowedPlanSlugs,';
const policySavePrefix = '        required_plan: resolveLegacyRequiredPlan(allowedPlanSlugs),\n        allowed_plan_slugs: applyFreeAccessOverrideMarkers(persistedAllowedPlanSlugs,';

if (source.includes(policySavePrefix) || source.includes(persistedSave)) {
  console.log(`[free-tone-editor] save persistence already patched: ${relPath}`);
} else if (source.includes(legacySave)) {
  source = source.replace(legacySave, persistedSave);
} else {
  throw new Error("[free-tone-editor] anchor not found: save persisted plans");
}

fs.writeFileSync(filePath, source, "utf8");
console.log(`[free-tone-editor] persistence patched: ${relPath}`);
