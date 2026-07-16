import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/lib/communication/automation-engine.ts");
let source = fs.readFileSync(filePath, "utf8");

const marker = `const GLOBAL_DAILY_AUTOMATION_LIMIT = 3;\n`;
const helper = `const GLOBAL_DAILY_AUTOMATION_LIMIT = 3;\nconst ASAAS_CHECKOUT_ABANDONMENT_HOURS = 2;\n\nasync function detectAbandonedAsaasCheckouts(admin: SupabaseAdmin & any) {\n  const cutoff = new Date(Date.now() - ASAAS_CHECKOUT_ABANDONMENT_HOURS * 60 * 60 * 1000).toISOString();\n  const lookback = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();\n\n  const { data: starts, error } = await admin\n    .from(\"billing_events\")\n    .select(\"id,event_type,payload,created_at\")\n    .eq(\"provider\", \"asaas\")\n    .in(\"event_type\", [\"checkout.asaas.started\", \"checkout.asaas.reused\"])\n    .gte(\"created_at\", lookback)\n    .lte(\"created_at\", cutoff)\n    .order(\"created_at\", { ascending: true })\n    .limit(200);\n\n  if (error) {\n    console.warn(\"[communication] Falha ao buscar checkouts Asaas pendentes\", error);\n    return { scanned: 0, created: 0 };\n  }\n\n  let created = 0;\n  for (const row of starts ?? []) {\n    const payload = (row.payload ?? {}) as Record<string, any>;\n    const userId = String(payload.user_id ?? payload.userId ?? \"\").trim();\n    const subscriptionId = String(payload.gateway_subscription_id ?? payload.subscription_id ?? \"\").trim();\n    const planSlug = String(payload.plan_slug ?? payload.plan ?? \"\").trim().toLowerCase();\n    if (!userId || !subscriptionId) continue;\n\n    const { data: paid } = await admin\n      .from(\"billing_events\")\n      .select(\"id\")\n      .eq(\"provider\", \"asaas\")\n      .in(\"event_type\", [\"PAYMENT_RECEIVED\", \"PAYMENT_CONFIRMED\"])\n      .or(\`payload->payment->>subscription.eq.\${subscriptionId},payload->subscription->>id.eq.\${subscriptionId},payload->>gateway_subscription_id.eq.\${subscriptionId}\`)\n      .gte(\"created_at\", row.created_at)\n      .limit(1)\n      .maybeSingle();\n    if (paid?.id) continue;\n\n    const { data: activeSubscription } = await admin\n      .from(\"subscriptions\")\n      .select(\"id,status,updated_at\")\n      .eq(\"user_id\", userId)\n      .eq(\"gateway\", \"asaas\")\n      .eq(\"gateway_subscription_id\", subscriptionId)\n      .in(\"status\", [\"active\", \"trialing\"])\n      .gte(\"updated_at\", row.created_at)\n      .limit(1)\n      .maybeSingle();\n    if (activeSubscription?.id) continue;\n\n    const { data: existing } = await admin\n      .from(\"marketing_events\")\n      .select(\"id\")\n      .eq(\"user_id\", userId)\n      .eq(\"event_key\", \"checkout_abandoned\")\n      .eq(\"metadata->>gateway_subscription_id\", subscriptionId)\n      .limit(1)\n      .maybeSingle();\n    if (existing?.id) continue;\n\n    const { error: insertError } = await admin.from(\"marketing_events\").insert({\n      user_id: userId,\n      event_key: \"checkout_abandoned\",\n      event_type: \"checkout.abandoned\",\n      event_label: \"Checkout Asaas abandonado\",\n      channel: \"billing\",\n      source: \"asaas_abandonment_detector\",\n      metadata: {\n        provider: \"asaas\",\n        checkout_event_id: row.id,\n        checkout_started_at: row.created_at,\n        abandonment_detected_at: new Date().toISOString(),\n        gateway_subscription_id: subscriptionId,\n        plan_slug: planSlug || null,\n        checkout_url: payload.checkout_url ?? payload.invoice_url ?? null,\n      },\n    });\n\n    if (insertError) console.warn(\"[communication] Falha ao registrar abandono Asaas\", { userId, subscriptionId, insertError });\n    else created += 1;\n  }\n\n  return { scanned: (starts ?? []).length, created };\n}\n`;

if (!source.includes("detectAbandonedAsaasCheckouts")) {
  if (!source.includes(marker)) throw new Error("Marcador de constantes não encontrado no automation-engine.ts");
  source = source.replace(marker, helper);
}

const processMarker = `  const result: ProcessResult = {\n    scannedAutomations: 0,`;
const processReplacement = `  await detectAbandonedAsaasCheckouts(admin);\n\n  const result: ProcessResult = {\n    scannedAutomations: 0,`;

if (!source.includes("await detectAbandonedAsaasCheckouts(admin);")) {
  if (!source.includes(processMarker)) throw new Error("Início do processador de automações não encontrado");
  source = source.replace(processMarker, processReplacement);
}

fs.writeFileSync(filePath, source, "utf8");
console.log("[asaas abandonment patch] Detector de checkout abandonado aplicado.");
