import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targets = [
  "src/app/api/audio/[id]/signed/route.ts",
  "src/app/api/audio/[id]/signed-url/route.ts",
];

for (const relPath of targets) {
  const filePath = path.join(root, relPath);
  let source = fs.readFileSync(filePath, "utf8");

  // The main free-tone patch historically matches this accessKit field with
  // four leading spaces. These two signed endpoints build accessKit inside a
  // try block, so the same field naturally has six spaces. Normalize only the
  // two field lines consumed by that patch. TypeScript/JS semantics are
  // unaffected; this only makes the existing patch anchor indentation-agnostic.
  const original = source;
  source = source.replace(
    /\n\s+allowPitchShift: kit\.allow_pitch_shift \?\? true,\n\s+maxPitchShiftSemitones: kit\.max_pitch_shift_semitones \?\? 2,/,
    "\n    allowPitchShift: kit.allow_pitch_shift ?? true,\n    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,",
  );

  if (source !== original) {
    fs.writeFileSync(filePath, source, "utf8");
    console.log(`[free-tone-anchor-compat] normalized: ${relPath}`);
  } else if (source.includes('allowFreeToneChange: Array.isArray(kit.allowed_plan_slugs)')) {
    console.log(`[free-tone-anchor-compat] already patched: ${relPath}`);
  } else {
    throw new Error(`[free-tone-anchor-compat] expected accessKit fields not found: ${relPath}`);
  }
}

console.log("[free-tone-anchor-compat] done");
