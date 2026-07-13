import fs from "node:fs";
import path from "node:path";

function patchFile(relativePath, patches, label) {
  const filePath = path.join(process.cwd(), relativePath);
  let source = fs.readFileSync(filePath, "utf8");

  for (const patch of patches) {
    if (source.includes(patch.to)) continue;
    if (!source.includes(patch.from)) {
      throw new Error(`[${label}] Trecho não encontrado: ${patch.name}`);
    }
    source = source.replace(patch.from, patch.to);
  }

  fs.writeFileSync(filePath, source, "utf8");
}

patchFile(
  "src/lib/data/billing.ts",
  [
    {
      name: "importar cancelamento Asaas",
      from: `import { createCheckoutSession, createCustomerPortalSession, getOrCreateCustomer, updateSubscription } from "@/lib/stripe/client";`,
      to: `import { createCheckoutSession, createCustomerPortalSession, getOrCreateCustomer, updateSubscription } from "@/lib/stripe/client";\nimport { cancelSubscription as cancelAsaasSubscription } from "@/lib/asaas/subscriptions";`,
    },
    {
      name: "carregar período e assinatura externa",
      from: `.select("id,status,gateway,original_gateway,migrated_from_pms,legacy_pms_subscription_id")`,
      to: `.select("id,status,gateway,gateway_subscription_id,current_period_end,original_gateway,migrated_from_pms,legacy_pms_subscription_id")`,
    },
    {
      name: "bloquear checkout Stripe e cancelar Asaas pendente",
      from: `  if (isActiveMigratedSubscription(existing)) {\n    return;\n  }\n\n  const result = existing?.id`,
      to: `  if (isActiveMigratedSubscription(existing)) {\n    return;\n  }\n\n  const existingGateway = normalizeSubscriptionValue(existing?.gateway);\n  const existingStatus = normalizeSubscriptionValue(existing?.status);\n  const periodEndTime = existing?.current_period_end ? Date.parse(existing.current_period_end) : NaN;\n  const hasFutureAccess = !existing?.current_period_end || Number.isNaN(periodEndTime) || periodEndTime > Date.now();\n  if (existingGateway && existingGateway !== "stripe" && ["active", "trialing"].includes(existingStatus) && hasFutureAccess) {\n    throw new Error("Já existe uma assinatura ativa em outro meio de pagamento. Cancele ou finalize a troca antes de iniciar um novo checkout.");\n  }\n\n  if (existingGateway === "asaas" && ["pending", "overdue", "past_due"].includes(existingStatus) && existing?.gateway_subscription_id) {\n    await cancelAsaasSubscription(existing.gateway_subscription_id).catch((error) => {\n      console.warn("[billing] Não foi possível cancelar checkout Asaas pendente antes da troca para Stripe", error);\n    });\n  }\n\n  const result = existing?.id`,
    },
  ],
  "cross-gateway billing patch",
);

patchFile(
  "src/app/api/billing/checkout/asaas/route.ts",
  [
    {
      name: "bloquear checkout Asaas com Stripe ativo",
      from: `    const rows = (existingSubscriptions ?? []) as ExistingSubscriptionRow[];\n    const subscriptionToUpdate = pickSubscriptionToUpdate(rows);`,
      to: `    const rows = (existingSubscriptions ?? []) as ExistingSubscriptionRow[];\n    const activeOtherGateway = rows.find((subscription) => {\n      const gateway = String(subscription.gateway ?? "").trim().toLowerCase();\n      return gateway && gateway !== "asaas" && hasFutureAccess(subscription);\n    });\n    if (activeOtherGateway) {\n      return NextResponse.redirect(appUrl(req, "/assinatura?message=Sua%20assinatura%20j%C3%A1%20est%C3%A1%20ativa%20em%20outro%20meio%20de%20pagamento."), { status: 303 });\n    }\n\n    const subscriptionToUpdate = pickSubscriptionToUpdate(rows);`,
    },
  ],
  "cross-gateway Asaas checkout patch",
);

patchFile(
  "src/app/api/webhooks/stripe/route.ts",
  [
    {
      name: "registrar conflito Stripe contra gateway ativo",
      from: `function isCurrentActiveNonStripeSubscription(previous: PreviousSubscriptionContext) {\n  const gateway = normalizeLower(previous.gateway);\n  if (!gateway || gateway === "stripe") return false;\n  const status = normalizeLower(previous.status);\n  if (!["active", "trialing"].includes(status ?? "")) return false;\n  if (!previous.currentPeriodEnd) return true;\n  const currentPeriodEndTime = Date.parse(previous.currentPeriodEnd);\n  return Number.isNaN(currentPeriodEndTime) || currentPeriodEndTime > Date.now();\n}`,
      to: `function isCurrentActiveNonStripeSubscription(previous: PreviousSubscriptionContext) {\n  const gateway = normalizeLower(previous.gateway);\n  if (!gateway || gateway === "stripe") return false;\n  const status = normalizeLower(previous.status);\n  if (!["active", "trialing"].includes(status ?? "")) return false;\n  if (!previous.currentPeriodEnd) return true;\n  const currentPeriodEndTime = Date.parse(previous.currentPeriodEnd);\n  return Number.isNaN(currentPeriodEndTime) || currentPeriodEndTime > Date.now();\n}\n\nasync function recordStripeCrossGatewayConflict(supabase: any, event: StripeEvent, userId: string, previous: PreviousSubscriptionContext, incomingSubscriptionId: string | null) {\n  const object = event.data?.object ?? {};\n  const incomingPaymentId = getStripeId(object.payment_intent) ?? getStripeId(object.charge) ?? normalize(object.id);\n  const dedupeKey = [userId, "stripe", event.id, incomingPaymentId ?? "", incomingSubscriptionId ?? ""].join(":");\n  const { error } = await supabase.from("billing_gateway_conflicts").upsert({\n    dedupe_key: dedupeKey,\n    user_id: userId,\n    active_gateway: previous.gateway ?? "unknown",\n    incoming_gateway: "stripe",\n    active_subscription_id: previous.id,\n    incoming_gateway_subscription_id: incomingSubscriptionId,\n    incoming_payment_id: incomingPaymentId,\n    incoming_event_id: event.id,\n    incoming_event_type: event.type,\n    reason: "active_subscription_owned_by_other_gateway",\n    metadata: { active_status: previous.status, active_period_end: previous.currentPeriodEnd },\n    updated_at: new Date().toISOString(),\n  }, { onConflict: "dedupe_key", ignoreDuplicates: true });\n  if (error && error.code !== "42P01") console.error("[stripe.webhook] Falha ao registrar conflito multigateway", error);\n}`,
    },
    {
      name: "bloquear qualquer evento Stripe concorrente",
      from: `function shouldIgnoreStripeEventForCurrentNonStripeSubscription(eventType: string) {\n  return ["customer.subscription.deleted", "checkout.session.expired"].includes(eventType) || isStripePaymentFailureEvent(eventType);\n}`,
      to: `function shouldIgnoreStripeEventForCurrentNonStripeSubscription(eventType: string) {\n  return [\n    "checkout.session.completed",\n    "checkout.session.expired",\n    "customer.subscription.created",\n    "customer.subscription.updated",\n    "customer.subscription.deleted",\n    "invoice.paid",\n    "invoice.payment_succeeded",\n    "invoice.payment_failed",\n    "charge.failed",\n    "payment_intent.payment_failed",\n  ].includes(eventType);\n}`,
    },
    {
      name: "auditar bloqueio Stripe concorrente",
      from: `    console.info("[stripe.webhook] Evento Stripe ignorado porque assinatura atual ativa usa outro gateway", {\n      eventId: event.id,\n      eventType: event.type,\n      userId,\n      currentGateway: previous.gateway,\n      currentStatus: previous.status,\n      currentPeriodEnd: previous.currentPeriodEnd,\n    });\n    return null;`,
      to: `    console.info("[stripe.webhook] Evento Stripe ignorado porque assinatura atual ativa usa outro gateway", {\n      eventId: event.id,\n      eventType: event.type,\n      userId,\n      currentGateway: previous.gateway,\n      currentStatus: previous.status,\n      currentPeriodEnd: previous.currentPeriodEnd,\n    });\n    await recordStripeCrossGatewayConflict(supabase, event, userId, previous, syncedSubscriptionId);\n    return null;`,
    },
    {
      name: "não salvar fatura Stripe concorrente como canônica",
      from: `    await saveBillingInvoiceFromStripeEvent(supabase, event, context);`,
      to: `    if (context) await saveBillingInvoiceFromStripeEvent(supabase, event, context);`,
    },
  ],
  "cross-gateway Stripe webhook patch",
);

patchFile(
  "src/app/api/webhooks/asaas/route.ts",
  [
    {
      name: "helpers de conflito Asaas",
      from: `async function findFallbackSubscription(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: AsaasWebhookPayload, checkoutUserId: string | null) {`,
      to: `async function findActiveOtherGatewaySubscription(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string | null) {\n  if (!userId) return null;\n  const { data, error } = await supabase\n    .from("subscriptions")\n    .select("id,user_id,status,gateway,gateway_subscription_id,current_period_end")\n    .eq("user_id", userId)\n    .neq("gateway", "asaas")\n    .in("status", ["active", "trialing"])\n    .order("updated_at", { ascending: false })\n    .limit(1)\n    .maybeSingle();\n  if (error) console.error("[asaas.webhook] Falha ao buscar gateway concorrente", error);\n  if (!data) return null;\n  if (!data.current_period_end) return data;\n  const periodEnd = Date.parse(data.current_period_end);\n  return Number.isNaN(periodEnd) || periodEnd > Date.now() ? data : null;\n}\n\nasync function recordAsaasCrossGatewayConflict(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: AsaasWebhookPayload, userId: string, active: any) {\n  const incomingSubscriptionId = gatewaySubscriptionId(payload);\n  const incomingPaymentId = asaasPaymentId(payload);\n  const incomingEventId = asaasExternalEventId(payload);\n  const dedupeKey = [userId, "asaas", incomingEventId ?? "", incomingPaymentId ?? "", incomingSubscriptionId ?? ""].join(":");\n  const { error } = await supabase.from("billing_gateway_conflicts").upsert({\n    dedupe_key: dedupeKey,\n    user_id: userId,\n    active_gateway: active.gateway ?? "unknown",\n    incoming_gateway: "asaas",\n    active_subscription_id: active.id ?? null,\n    incoming_gateway_subscription_id: incomingSubscriptionId,\n    incoming_payment_id: incomingPaymentId,\n    incoming_event_id: incomingEventId,\n    incoming_event_type: payload.event ?? null,\n    reason: "active_subscription_owned_by_other_gateway",\n    metadata: { active_status: active.status, active_period_end: active.current_period_end },\n    updated_at: new Date().toISOString(),\n  }, { onConflict: "dedupe_key", ignoreDuplicates: true });\n  if (error && error.code !== "42P01") console.error("[asaas.webhook] Falha ao registrar conflito multigateway", error);\n}\n\nasync function findFallbackSubscription(supabase: ReturnType<typeof createSupabaseAdminClient>, payload: AsaasWebhookPayload, checkoutUserId: string | null) {`,
    },
    {
      name: "bloquear pagamento Asaas tardio",
      from: `    const fallbackSubscription = exactSubscription ?? await findFallbackSubscription(supabase, payload, checkout?.userId ?? null);\n    if (!fallbackSubscription?.id) { await markEvent(supabase, payload, false, "Assinatura local Asaas não encontrada."); return NextResponse.json({ received: true, synced: false }); }`,
      to: `    const fallbackSubscription = exactSubscription ?? await findFallbackSubscription(supabase, payload, checkout?.userId ?? null);\n    if (!fallbackSubscription?.id) {\n      const conflictUserId = checkout?.userId ?? externalUserId(payload);\n      const activeOtherGateway = await findActiveOtherGatewaySubscription(supabase, conflictUserId);\n      if (activeOtherGateway && conflictUserId) {\n        await recordAsaasCrossGatewayConflict(supabase, payload, conflictUserId, activeOtherGateway);\n        await markEvent(supabase, payload, true, undefined, { ignored: true, reason: "active_subscription_owned_by_other_gateway", active_gateway: activeOtherGateway.gateway, active_subscription_id: activeOtherGateway.id });\n        return NextResponse.json({ received: true, synced: false, ignored: true, reason: "active_subscription_owned_by_other_gateway" });\n      }\n      await markEvent(supabase, payload, false, "Assinatura local Asaas não encontrada.");\n      return NextResponse.json({ received: true, synced: false });\n    }`,
    },
  ],
  "cross-gateway Asaas webhook patch",
);

console.log("[cross-gateway patch] Arbitragem multigateway aplicada com sucesso.");
