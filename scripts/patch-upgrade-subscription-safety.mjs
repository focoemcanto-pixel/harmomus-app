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
      name: "carregar plano ao preparar checkout Stripe",
      from: `.select("id,status,gateway,gateway_subscription_id,current_period_end,original_gateway,migrated_from_pms,legacy_pms_subscription_id")`,
      to: `.select("id,status,gateway,gateway_subscription_id,current_period_end,original_gateway,migrated_from_pms,legacy_pms_subscription_id,plans(slug)")`,
    },
    {
      name: "migração Free não bloqueia checkout pago",
      from: `  return migrated && ["active", "trialing"].includes(status);`,
      to: `  const relatedPlanSlug = Array.isArray(subscription?.plans) ? subscription.plans[0]?.slug : (subscription?.plans as any)?.slug;\n  const planFamily = normalizePlanFamily(relatedPlanSlug ?? "free");\n  return migrated && planRank(planFamily) > 0 && ["active", "trialing"].includes(status);`,
    },
    {
      name: "Stripe bloqueia apenas outro plano pago ativo",
      from: `  if (existingGateway && existingGateway !== "stripe" && ["active", "trialing"].includes(existingStatus) && hasFutureAccess) {\n    throw new Error("Já existe uma assinatura ativa em outro meio de pagamento. Cancele ou finalize a troca antes de iniciar um novo checkout.");\n  }`,
      to: `  const existingRelatedPlanSlug = Array.isArray(existing?.plans) ? existing.plans[0]?.slug : (existing?.plans as any)?.slug;\n  const existingPlanFamily = normalizePlanFamily(existingRelatedPlanSlug ?? "free");\n  const existingPaidPlan = planRank(existingPlanFamily) > 0;\n  if (existingGateway && existingGateway !== "stripe" && existingPaidPlan && ["active", "trialing"].includes(existingStatus) && hasFutureAccess) {\n    throw new Error("Já existe uma assinatura paga ativa em outro meio de pagamento. Cancele ou finalize a troca antes de iniciar um novo checkout.");\n  }`,
    },
    {
      name: "portal usa somente cliente Stripe",
      from: `  const existingCustomerId = sub?.stripe_customer_id ?? sub?.gateway_customer_id;`,
      to: `  const subGateway = normalizeSubscriptionValue(sub?.gateway);\n  const existingCustomerId = sub?.stripe_customer_id ?? (subGateway === "stripe" ? sub?.gateway_customer_id : null);`,
    },
    {
      name: "validar troca direta de plano Stripe",
      from: `  if (!sub?.id) throw new Error("Nenhuma assinatura encontrada para este usuário.");\n  if (!sub?.stripe_subscription_id) throw new Error("Assinatura inválida para upgrade/troca de plano.");\n  if (sub.plan_id === planId) return;`,
      to: `  if (!sub?.id) throw new Error("Nenhuma assinatura encontrada para este usuário.");\n  const subscriptionGateway = normalizeSubscriptionValue(sub?.gateway);\n  const subscriptionStatus = normalizeSubscriptionValue(sub?.status);\n  if (subscriptionGateway && subscriptionGateway !== "stripe") throw new Error("Esta assinatura não é gerenciada pelo Stripe. Use o fluxo de pagamento correspondente.");\n  if (!["active", "trialing"].includes(subscriptionStatus)) throw new Error("A assinatura precisa estar ativa para trocar de plano diretamente.");\n  if (!sub?.stripe_subscription_id) throw new Error("Assinatura inválida para upgrade/troca de plano.");\n  if (sub.plan_id === planId) return;`,
    },
  ],
  "upgrade safety billing",
);

patchFile(
  "src/app/api/billing/checkout/asaas/route.ts",
  [
    {
      name: "aguardar URL da cobrança Asaas sem abrir painel de assinatura",
      from: `    const payments = await listSubscriptionPayments(asaasSubscription.id, 3).catch(() => []);\n    const paymentUrl = findPaymentUrl(asaasSubscription.paymentLink, payments);\n    if (paymentUrl) return NextResponse.redirect(paymentUrl, { status: 303 });\n    return NextResponse.redirect(appUrl(req, "/assinatura?message=Assinatura%20Asaas%20criada.%20Aguarde%20a%20cobran%C3%A7a."), { status: 303 });`,
      to: `    let paymentUrl = findPaymentUrl(asaasSubscription.paymentLink, []);\n    for (let attempt = 0; !paymentUrl && attempt < 4; attempt += 1) {\n      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 500));\n      const payments = await listSubscriptionPayments(asaasSubscription.id, 3).catch(() => []);\n      paymentUrl = findPaymentUrl(asaasSubscription.paymentLink, payments);\n    }\n    if (paymentUrl) return NextResponse.redirect(paymentUrl, { status: 303 });\n    const pendingMessage = encodeURIComponent("Sua cobrança foi criada, mas o link ainda está sendo preparado. Aguarde alguns segundos e tente abrir o checkout novamente; a cobrança existente será reaproveitada.");\n    return NextResponse.redirect(appUrl(req, "/checkout?plan=" + encodeURIComponent(planSlug) + "&method=" + encodeURIComponent(method) + "&error=" + pendingMessage), { status: 303 });`,
    },
  ],
  "upgrade safety asaas checkout",
);

patchFile(
  "src/app/api/webhooks/stripe/route.ts",
  [
    {
      name: "webhook Stripe ignora conflito com plano Free",
      from: `  const status = normalizeLower(previous.status);\n  if (!["active", "trialing"].includes(status ?? "")) return false;`,
      to: `  const status = normalizeLower(previous.status);\n  if (!["active", "trialing"].includes(status ?? "")) return false;\n  if (planRank(previous.planSlug) <= 0) return false;`,
    },
  ],
  "upgrade safety stripe webhook",
);

patchFile(
  "src/app/api/webhooks/asaas/route.ts",
  [
    {
      name: "carregar plano no conflito Asaas",
      from: `.select("id,user_id,status,gateway,gateway_subscription_id,current_period_end")\n    .eq("user_id", userId)`,
      to: `.select("id,user_id,status,gateway,gateway_subscription_id,current_period_end,plans(slug)")\n    .eq("user_id", userId)`,
    },
    {
      name: "webhook Asaas ignora conflito com plano Free",
      from: `  if (!data) return null;\n  if (!data.current_period_end) return data;`,
      to: `  if (!data) return null;\n  const relatedPlanSlug = Array.isArray(data.plans) ? data.plans[0]?.slug : (data.plans as any)?.slug;\n  if (planRank(relatedPlanSlug ?? "free") <= 0) return null;\n  if (!data.current_period_end) return data;`,
    },
  ],
  "upgrade safety asaas webhook",
);

console.log("[upgrade safety patch] Fluxos de upgrade e assinatura protegidos.");