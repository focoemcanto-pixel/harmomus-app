import fs from "node:fs";
import path from "node:path";

function patchFile(relativePath, replacements) {
  const filePath = path.join(process.cwd(), relativePath);
  let source = fs.readFileSync(filePath, "utf8");

  for (const { label, from, to } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) {
      throw new Error(`[billing communication patch] Trecho não encontrado em ${relativePath}: ${label}`);
    }
    source = source.replace(from, to);
  }

  fs.writeFileSync(filePath, source, "utf8");
}

patchFile("src/lib/webhooks/dispatcher.ts", [
  {
    label: "não descartar upgrade free para premium",
    from: `  if (input.event === "upgrade.free_to_premium") {\n    return { dispatched: 0, skipped: true, reason: "free_to_premium_uses_plan_premium_activated" };\n  }\n\n`,
    to: ``,
  },
]);

patchFile("src/app/api/webhooks/stripe/route.ts", [
  {
    label: "registrar eventos Stripe na Central de Comunicação",
    from: `  await Promise.allSettled(events.map((eventName) => dispatchWebhookEvent({ event: eventName, source: "stripe", recipient, data })));`,
    to: `  await Promise.allSettled(\n    events.flatMap((eventName) => [\n      trackMarketingEvent(supabase, {\n        userId: context.userId,\n        eventKey: eventName,\n        eventLabel: eventName,\n        channel: "billing",\n        source: "stripe",\n        metadata: data,\n      }),\n      dispatchWebhookEvent({ event: eventName, source: "stripe", recipient, data }),\n    ]),\n  );`,
  },
]);

patchFile("src/app/api/webhooks/asaas/route.ts", [
  {
    label: "importar registro de eventos internos",
    from: `import { ensureMinistryForSubscription } from "@/lib/data/ministry";`,
    to: `import { trackMarketingEvent } from "@/lib/communications/events";\nimport { ensureMinistryForSubscription } from "@/lib/data/ministry";`,
  },
  {
    label: "registrar eventos Asaas na Central de Comunicação",
    from: `  for (const event of Array.from(new Set(input.events))) await dispatchWebhookEvent({ event, source: "asaas", recipient, data });`,
    to: `  for (const event of Array.from(new Set(input.events))) {\n    await Promise.allSettled([\n      trackMarketingEvent(input.supabase as any, {\n        userId: input.subscription.user_id,\n        eventKey: event,\n        eventLabel: event,\n        channel: "billing",\n        source: "asaas",\n        metadata: data,\n      }),\n      dispatchWebhookEvent({ event, source: "asaas", recipient, data }),\n    ]);\n  }`,
  },
  {
    label: "emitir upgrade e plano ativado no Asaas",
    from: `    const activationEvent = shouldActivate ? (getSpecificPlanTransitionEvent(checkout?.previousPlanSlug ?? currentSlug, nextPlanSlug) ?? getPlanActivatedEvent(nextPlanSlug)) : null;\n    const failedEvent = shouldMarkOverdue ? "subscription.payment_failed" as WebhookEvent : null;\n    const dispatchEvents = [activationEvent, failedEvent].filter(Boolean) as WebhookEvent[];`,
    to: `    const activationEvents = shouldActivate\n      ? [\n          getSpecificPlanTransitionEvent(checkout?.previousPlanSlug ?? currentSlug, nextPlanSlug),\n          getPlanActivatedEvent(nextPlanSlug),\n        ].filter(Boolean) as WebhookEvent[]\n      : [];\n    const failedEvent = shouldMarkOverdue ? "subscription.payment_failed" as WebhookEvent : null;\n    const dispatchEvents = [...activationEvents, failedEvent].filter(Boolean) as WebhookEvent[];`,
  },
]);

console.log("[billing communication patch] Eventos de assinatura conectados à Central de Comunicação.");
