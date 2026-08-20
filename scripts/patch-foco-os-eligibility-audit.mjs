import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/lib/communication/foco-os-direct-delivery.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(label, from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[foco os eligibility audit] trecho não encontrado: ${label}`);
  source = source.replace(from, to);
}

replaceOnce(
  "normalizar abandono underscore",
  `  if (key === "checkout.abandoned" || /^checkout\\.(plus|premium)\\.abandoned$/.test(key)) {`,
  `  if (key === "checkout.abandoned" || key === "checkout_abandoned" || /^checkout\\.(plus|premium)\\.abandoned$/.test(key)) {`,
);

replaceOnce(
  "usar link específico do evento",
  `  const link = absoluteUrl(automation.cta_url);\n  const plan = String(metadata.plan ?? metadata.plan_slug ?? "");`,
  `  const eventLink = absoluteUrl(\n    metadata.checkout_url ??\n    metadata.invoice_url ??\n    metadata.hosted_invoice_url ??\n    metadata.payment_url ??\n    metadata.url ??\n    "",\n  );\n  const link = eventLink || absoluteUrl(automation.cta_url);\n  const plan = String(metadata.plan ?? metadata.plan_slug ?? metadata.to_plan_slug ?? "");`,
);

replaceOnce(
  "renderizar próxima cobrança",
  `    .replace(/{{\\s*plano\\s*}}/gi, plan)\n    .replace(/{{\\s*valor\\s*}}/gi, amount);`,
  `    .replace(/{{\\s*plano\\s*}}/gi, plan)\n    .replace(/{{\\s*valor\\s*}}/gi, amount)\n    .replace(/{{\\s*proxima_cobranca\\s*}}/gi, String(metadata.next_billing_at ?? metadata.period_end ?? ""));`,
);

replaceOnce(
  "preservar primeira automação por gatilho",
  `  const byTrigger = new Map(active.map((automation) => [normalize(automation.trigger_event), automation]));\n  const triggers = [...byTrigger.keys()];`,
  `  const byTrigger = new Map<string, Automation>();\n  for (const automation of active) {\n    const trigger = normalize(automation.trigger_event);\n    if (trigger && !byTrigger.has(trigger)) byTrigger.set(trigger, automation);\n  }\n  const triggers = [...byTrigger.keys()];`,
);

replaceOnce(
  "payload usar link resolvido do evento",
  `    const message = render(automation.message_template, automation, event, profile);\n    const link = absoluteUrl(automation.cta_url);`,
  `    const message = render(automation.message_template, automation, event, profile);\n    const link = absoluteUrl(\n      metadata.checkout_url ??\n      metadata.invoice_url ??\n      metadata.hosted_invoice_url ??\n      metadata.payment_url ??\n      automation.cta_url,\n    );`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[foco os eligibility audit] Regras e renderização do Foco OS endurecidas com sucesso.");
