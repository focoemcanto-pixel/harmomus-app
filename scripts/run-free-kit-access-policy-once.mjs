import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "src/lib/access/access-rules.ts");
const source = fs.readFileSync(target, "utf8");

// access-rules.ts is the canonical sentinel for this policy. The previous
// wrapper also looked for a PublicKit type declaration that lives in another
// file, so the condition could never become true on the second OpenNext build.
const alreadyApplied =
  source.includes("let specialKitIdsCache:") &&
  source.includes("async function getSpecialFreeAccessKitIds()") &&
  source.includes("async function getKitAccessCount(") &&
  source.includes("function enrichStatsForKit(") &&
  source.includes('reason: "kit_free_limit"');

if (alreadyApplied) {
  console.log("[free-access-policy-once] policy already applied; skipping second build mutation");
} else {
  console.log("[free-access-policy-once] applying policy");
  execFileSync(process.execPath, [path.join(root, "scripts/patch-free-kit-access-policy.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
}
