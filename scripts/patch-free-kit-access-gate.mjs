import fs from "node:fs";
import path from "node:path";

const relPath = "src/components/public/premium-kit-gate-card.tsx";
const filePath = path.join(process.cwd(), relPath);
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`[free-access-gate] anchor not found: ${label}`);
  source = source.replace(search, replacement);
}

replaceOnce(
  "    nextResetAt?: string;\n  } | null;",
  "    nextResetAt?: string;\n    kitAccessCount?: number;\n    kitLimit?: number | null;\n  } | null;",
  "stats fields",
);

replaceOnce(
  '  if (reason === "free_limit") {',
  '  if (reason === "kit_free_limit") {\n    const used = stats?.kitAccessCount ?? stats?.kitLimit ?? 0;\n    const limit = stats?.kitLimit ?? 0;\n    const resetAt = formatResetTime(stats?.nextResetAt);\n\n    return {\n      eyebrow: "Limite deste kit atingido",\n      icon: "⏳",\n      title: "Você atingiu o limite de acessos deste kit",\n      description: `Este kit permite até ${limit} visitas válidas a cada 24 horas para usuários Free. Você já utilizou ${used}/${limit}. Novos acessos serão liberados após ${resetAt}.`,\n      primaryHref: "/biblioteca",\n      primaryLabel: "Voltar para biblioteca",\n      secondaryHref: "/assinar?plan=plus",\n      secondaryLabel: "Estudar sem limites",\n      footer: "A regra deste kit é independente da cota geral de visitas do plano Free.",\n    };\n  }\n\n  if (reason === "free_limit") {',
  "custom kit gate",
);

fs.writeFileSync(filePath, source, "utf8");
console.log(`[free-access-gate] patched: ${relPath}`);
