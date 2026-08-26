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

function replaceOnce(source, search, replacement, label, alreadyPatchedNeedle = null) {
  if (source.includes(replacement)) return source;
  if (alreadyPatchedNeedle && source.includes(alreadyPatchedNeedle)) {
    console.log(`[free-tone-access] already patched: ${label}`);
    return source;
  }
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
    'free_tone_access: formData.has("free_tone_access")',
  );

  next = replaceOnce(
    next,
    '            <label className="flex items-center gap-2 text-sm text-muted">\n              <input name="allow_pitch_shift" type="checkbox" defaultChecked={toneInitialData?.allow_pitch_shift ?? true} className="h-4 w-4 rounded border-border bg-surface-muted" />\n              Permitir modulação inteligente\n            </label>',
    '            <label className="flex items-center gap-2 text-sm text-muted">\n              <input name="allow_pitch_shift" type="checkbox" defaultChecked={toneInitialData?.allow_pitch_shift ?? true} className="h-4 w-4 rounded border-border bg-surface-muted" />\n              Permitir modulação inteligente\n            </label>\n            <label className="flex items-start gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3 text-sm text-muted">\n              <input\n                name="free_tone_access"\n                type="checkbox"\n                defaultChecked={Array.isArray((initialData as any)?.allowed_plan_slugs) && (initialData as any).allowed_plan_slugs.includes("free_tone_access")}\n                className="mt-0.5 h-4 w-4 rounded border-border bg-surface-muted"\n              />\n              <span>\n                <strong className="block text-foreground">Liberar troca de tom para usuários Free</strong>\n                <span className="mt-1 block text-xs text-muted">Use quando liberar este kit para estudo e quiser permitir que usuários gratuitos escolham outros tons disponíveis.</span>\n              </span>\n            </label>',
    "kit-form free tone checkbox",
    'name="free_tone_access"',
  );
  return next;
});

patch("src/app/api/admin/kits/[id]/route.ts", (source) => source);
patch("src/app/admin/kits/novo/page.tsx", (source) => source);
patch("src/lib/data/public-kits.ts", (source) => source);
patch("src/lib/access/access-rules.ts", (source) => source);

for (const relPath of [
  "src/app/api/audio/[id]/route.ts",
  "src/app/api/audio/[id]/signed/route.ts",
  "src/app/api/audio/[id]/signed-url/route.ts",
]) {
  patch(relPath, (source) => {
    const fieldAnchor = '    allowPitchShift: kit.allow_pitch_shift ?? true,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2;';
    const fieldReplacement = '    allowPitchShift: kit.allow_pitch_shift ?? true,\n    allowFreeToneChange: Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.includes("free") && kit.allowed_plan_slugs.includes("free_tone_access"),\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2;';
    if (source.includes("allowFreeToneChange:")) return source;
    if (source.includes(fieldAnchor)) return source.replace(fieldAnchor, fieldReplacement);
    return source;
  });
}

console.log(`[free-tone-access] done (${MARKER})`);
