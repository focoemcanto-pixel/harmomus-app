import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/lib/communication/marketing-queue.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceExact(label, from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[foco-os queue patch] Trecho não encontrado: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
  "aumentar limite de processamento manual",
  `const MAX_PROCESS_LIMIT = 1;\nconst MAX_WHATSAPP_PER_EXECUTION = 1;`,
  `const MAX_PROCESS_LIMIT = 20;\nconst MAX_WHATSAPP_PER_EXECUTION = 20;`,
);

replaceExact(
  "ignorar janela de disparo no handoff manual",
  `async function hasWhatsappWindowCapacity(admin: any) {\n  const since = new Date(Date.now() - WHATSAPP_SAFE_WINDOW_MINUTES * 60 * 1000).toISOString();`,
  `async function hasWhatsappWindowCapacity(admin: any) {\n  // Foco OS apenas recebe o card para envio humano. Não existe disparo automático\n  // nesta etapa, portanto os limites anti-rajada do antigo provedor não se aplicam.\n  const { data: activeIntegration } = await admin\n    .from("communication_whatsapp_integrations")\n    .select("config")\n    .eq("active", true)\n    .order("created_at", { ascending: false })\n    .limit(1)\n    .maybeSingle();\n  const activeConfig = activeIntegration?.config && typeof activeIntegration.config === "object"\n    ? activeIntegration.config as Record<string, unknown>\n    : {};\n  if (activeConfig.mode === "foco_os_manual") return true;\n\n  const since = new Date(Date.now() - WHATSAPP_SAFE_WINDOW_MINUTES * 60 * 1000).toISOString();`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[foco-os queue patch] Handoff manual liberado das travas de disparo automático.");
