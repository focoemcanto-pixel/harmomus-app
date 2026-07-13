import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/lib/communication/automation-engine.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceExact(label, from, to) {
  if (!source.includes(from)) {
    throw new Error(`[automation patch] Trecho não encontrado: ${label}`);
  }
  source = source.replace(from, to);
}

replaceExact(
  "eventos canônicos de conversão",
  `  "plan.plus_activated",\n  "plan.premium_activated",\n]);`,
  `  "plan.plus_activated",\n  "plan.premium_activated",\n  "plan.ministry_activated",\n  "subscription.trial_started",\n  "subscription.first_payment",\n  "subscription.renewed",\n  "subscription.payment_recovered",\n  "upgrade.free_to_plus",\n  "upgrade.free_to_premium",\n  "upgrade.plus_to_premium",\n]);`,
);

replaceExact(
  "classificação transacional",
  `const GLOBAL_DAILY_AUTOMATION_LIMIT = 3;`,
  `const GLOBAL_DAILY_AUTOMATION_LIMIT = 3;\n\nconst TRANSACTIONAL_EVENT_KEYS = new Set([\n  "subscription.trial_started",\n  "subscription.first_payment",\n  "subscription.renewed",\n  "subscription.payment_recovered",\n  "subscription.payment_failed",\n  "subscription.canceled",\n  "plan.plus_activated",\n  "plan.premium_activated",\n  "plan.ministry_activated",\n  "upgrade.free_to_plus",\n  "upgrade.free_to_premium",\n  "upgrade.plus_to_premium",\n  "downgrade.premium_to_plus",\n  "downgrade.premium_to_free",\n  "downgrade.plus_to_free",\n]);\n\nfunction isTransactionalAutomation(automation: AutomationRow) {\n  return automation.metadata?.transactional === true\n    || automation.metadata?.bypass_global_cooldown === true\n    || TRANSACTIONAL_EVENT_KEYS.has(normalize(automation.trigger_event));\n}\n\nfunction bypassDailyLimit(automation: AutomationRow) {\n  return isTransactionalAutomation(automation) || automation.metadata?.bypass_daily_limit === true;\n}`,
);

replaceExact(
  "falha canônica na regra de recuperação",
  `.filter((event) => getEventKey(event) === "payment_failed")`,
  `.filter((event) => ["payment_failed", "subscription.payment_failed"].includes(getEventKey(event)))`,
);

replaceExact(
  "cooldown transacional",
  `function isInCooldown(state?: UserMarketingStateRow | null, channel?: "whatsapp" | "email") {\n  const now = Date.now();`,
  `function isInCooldown(automation: AutomationRow, state?: UserMarketingStateRow | null, channel?: "whatsapp" | "email") {\n  if (isTransactionalAutomation(automation)) return null;\n\n  const now = Date.now();`,
);

replaceExact(
  "limite diário transacional",
  `  if (await reachedDailyAutomationLimit({ admin: input.admin, userId: input.profile.id, channel: input.automation.channel })) {\n    return { queueId: null, skippedReason: "daily_automation_limit_reached" };\n  }`,
  `  if (!bypassDailyLimit(input.automation)\n      && await reachedDailyAutomationLimit({ admin: input.admin, userId: input.profile.id, channel: input.automation.channel })) {\n    return { queueId: null, skippedReason: "daily_automation_limit_reached" };\n  }`,
);

replaceExact(
  "metadados da fila transacional",
  `        cancel_if_conversion: shouldCancelIfCompleted(input.automation),\n      },`,
  `        cancel_if_conversion: shouldCancelIfCompleted(input.automation),\n        transactional: isTransactionalAutomation(input.automation),\n        bypass_daily_limit: bypassDailyLimit(input.automation),\n        dedupe_key: input.event?.metadata?.dedupe_key ?? null,\n      },`,
);

replaceExact(
  "chamada de cooldown",
  `    const cooldownSkip = isInCooldown(state, winner.automation.channel);`,
  `    const cooldownSkip = isInCooldown(winner.automation, state, winner.automation.channel);`,
);

replaceExact(
  "registro de exclusividade",
  `    const winner = candidates[0];\n    const latestEvent = winner.matchingEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];`,
  `    const winner = candidates[0];\n    const latestEvent = winner.matchingEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];\n\n    // Um único comunicado vence por usuário em cada execução. Os demais eventos\n    // permanecem no ledger e podem ser auditados, mas não geram mensagens duplas.\n    const suppressedCandidates = candidates.slice(1).filter((candidate) => {\n      const candidateEvent = candidate.matchingEvents[0];\n      if (!candidateEvent || !latestEvent) return false;\n      return Math.abs(new Date(candidateEvent.created_at).getTime() - new Date(latestEvent.created_at).getTime()) <= 10 * 60 * 1000;\n    });\n\n    for (const suppressed of suppressedCandidates) {\n      const suppressedEvent = suppressed.matchingEvents.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];\n      await markSkipped({\n        admin,\n        automation: suppressed.automation,\n        userId,\n        event: suppressedEvent,\n        score: suppressed.score,\n        reason: \`suppressed_by_priority:\${winner.automation.trigger_event}\`,\n      });\n    }`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[automation patch] Motor transacional atualizado com sucesso.");
