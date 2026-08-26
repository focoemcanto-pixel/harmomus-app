import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const target = path.join(root, "src/lib/access/access-rules.ts");
const source = fs.readFileSync(target, "utf8");

const alreadyApplied =
  source.includes("function getSpecialFreeAccessKitIds()") &&
  source.includes('freeAccessMode?: "default" | "unlimited" | "custom"') &&
  source.includes("kit_free_limit");

if (alreadyApplied) {
  console.log("[free-access-policy-once] policy already applied; skipping second build mutation");
} else {
  execFileSync(process.execPath, [path.join(root, "scripts/patch-free-kit-access-policy.mjs")], {
    cwd: root,
    stdio: "inherit",
  });
}
