import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/app/api/webhooks/stripe/route.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceExact(label, from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) {
    throw new Error(`[stripe patch] Trecho não encontrado: ${label}`);
  }
  source = source.replace(from, to);
}

replaceExact(
  "eventos financeiros canônicos",
  `  if (["invoice.paid", "invoice.payment_succeeded"].includes(eventType)) return "payment.approved";\n  if (isStripePaymentFailureEvent(eventType)) return "subscription.payment_failed";\n  if (eventType === "charge.refunded") return "payment.refunded";\n  if (eventType === "charge.dispute.created") return "payment.chargeback";\n  if (eventType === "customer.subscription.updated" && isActiveSubscriptionStatus(status)) return "subscription.renewed";`,
  `  // Somente eventos de fatura inequívocos geram comunicação financeira.\n  // charge.failed e payment_intent.payment_failed são sinais técnicos da mesma tentativa.\n  if (eventType === "invoice.paid") return "payment.approved";\n  if (eventType === "invoice.payment_failed") return "subscription.payment_failed";\n  if (eventType === "charge.refunded") return "payment.refunded";\n  if (eventType === "charge.dispute.created") return "payment.chargeback";\n  // customer.subscription.updated apenas sincroniza estado; nunca confirma pagamento/renovação.`,
);

replaceExact(
  "ativação genérica por Stripe",
  `function shouldDispatchPlanActivated(eventType: string, context: NonNullable<SyncedSubscriptionContext>) {\n  if (!isActiveSubscriptionStatus(context.status)) return false;\n  const currentPlan = normalizePlanFamily(context.planSlug);\n  const previousPlan = normalizePlanFamily(context.previousPlanSlug);\n  if (!currentPlan || currentPlan === "free") return false;\n  if (eventType === "checkout.session.completed") return true;\n  if (eventType === "customer.subscription.created") return false;\n  if (["invoice.paid", "invoice.payment_succeeded"].includes(eventType)) return previousPlan !== currentPlan;\n  return eventType === "customer.subscription.updated" && previousPlan !== currentPlan;\n}`,
  `function shouldDispatchPlanActivated(_eventType: string, _context: NonNullable<SyncedSubscriptionContext>) {\n  // Ativações, trials, primeiros pagamentos e renovações são classificados pela\n  // camada canônica baseada em subscriptions/billing_invoices. O webhook técnico\n  // da Stripe não deve emitir plan.*_activated, evitando confirmações repetidas.\n  return false;\n}`,
);

replaceExact(
  "histórico financeiro canônico",
  `  if (["invoice.paid", "invoice.payment_succeeded"].includes(eventType)) return "renewed";`,
  `  if (eventType === "invoice.paid") return "renewed";`,
);

replaceExact(
  "plano anterior real em assinatura inativa",
  `      previousPlanSlug: metadataPreviousPlanSlug ?? inactiveSubscription?.previous.planSlug ?? previous.planSlug,`,
  `      previousPlanSlug: inactiveSubscription?.previous.planSlug ?? previous.planSlug ?? metadataPreviousPlanSlug,`,
);

replaceExact(
  "plano anterior real em assinatura ativa",
  `    previousPlanSlug: metadataPreviousPlanSlug ?? previous.planSlug,`,
  `    previousPlanSlug: previous.planSlug ?? metadataPreviousPlanSlug,`,
);

replaceExact(
  "falha canônica para automação",
  `  if (!isStripePaymentFailureEvent(event.type) || !context?.userId) return;`,
  `  // Somente invoice.payment_failed representa a falha de negócio da cobrança.\n  // Os eventos charge.failed/payment_intent.payment_failed continuam registrados\n  // tecnicamente, mas não criam novas comunicações para a mesma tentativa.\n  if (event.type !== "invoice.payment_failed" || !context?.userId) return;`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[stripe patch] Eventos financeiros normalizados com sucesso.");
