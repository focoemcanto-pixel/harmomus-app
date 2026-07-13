import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/app/api/auth/signup/route.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceExact(label, from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[signup communication patch] Trecho não encontrado: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
  "remover dispatcher externo",
  `import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";\nimport type { WebhookEvent } from "@/types/webhooks";\n`,
  ``,
);

replaceExact(
  "remover resolução de webhook de cadastro",
  `function resolveSignupWebhookEvent(plan: PlanSlug): WebhookEvent {\n  switch (plan) {\n    case "free":\n      return "subscription.free.created";\n    case "plus":\n      return "subscription.plus.created";\n    case "premium":\n      return "subscription.premium.created";\n    case "ministry_10":\n      return "subscription.ministry_10.created";\n    case "ministry_20":\n      return "subscription.ministry_20.created";\n    case "ministry_40":\n      return "subscription.ministry_40.created";\n    default:\n      return "user.created";\n  }\n}\n\n`,
  ``,
);

replaceExact(
  "adicionar userId aos efeitos de cadastro",
  `async function runSignupSideEffectsAsync(input: {\n  supabase: Awaited<ReturnType<typeof createClient>>;\n  plan: PlanSlug;`,
  `async function runSignupSideEffectsAsync(input: {\n  supabase: Awaited<ReturnType<typeof createClient>>;\n  userId: string;\n  plan: PlanSlug;`,
);

replaceExact(
  "usar somente eventos internos",
  `  const webhookEvent = resolveSignupWebhookEvent(input.plan);\n\n  try {\n    const results = await Promise.allSettled([\n      trackMarketingEvent(input.supabase as any, {\n        eventKey: "signup",\n        eventLabel: "Cadastro",\n        channel: "email",\n        metadata: { plan: input.plan, origin: input.origin, webhook_event: webhookEvent },\n      }),\n      dispatchWebhookEvent({\n        event: webhookEvent,\n        source: "auth.signup",\n        recipient: { name: input.fullName, email: input.email, phone: input.phone },\n        data: {\n          plan: input.plan,\n          username: input.username,\n          origin: input.origin,\n          utm_source: input.utmSource,\n          utm_campaign: input.utmCampaign,\n        },\n      }),\n    ]);`,
  `  const internalEventKey = input.plan === "free" ? "subscription.free.created" : "signup.paid_started";\n  const internalEventLabel = input.plan === "free" ? "Cadastro Free" : "Cadastro pago iniciado";\n  const eventClient = createSupabaseAdminClient() as any;\n\n  try {\n    const results = await Promise.allSettled([\n      trackMarketingEvent(eventClient, {\n        userId: input.userId,\n        eventKey: internalEventKey,\n        eventLabel: internalEventLabel,\n        channel: "product",\n        source: "auth.signup",\n        metadata: {\n          plan: input.plan,\n          origin: input.origin,\n          full_name: input.fullName,\n          email: input.email,\n          phone: input.phone,\n          username: input.username,\n          utm_source: input.utmSource,\n          utm_campaign: input.utmCampaign,\n          communication_owner: "harmomus_internal",\n        },\n      }),\n    ]);`,
);

replaceExact(
  "capturar usuário do convite ministerial",
  `      const response = await createConfirmedMinistryMemberAccount({ request, supabase, token: inviteToken, email, password: pass, fullName, username, phone, plan, origin });\n      await runSignupSideEffectsAsync({ supabase, plan, origin, fullName, email, phone, username, utmSource, utmCampaign });`,
  `      const response = await createConfirmedMinistryMemberAccount({ request, supabase, token: inviteToken, email, password: pass, fullName, username, phone, plan, origin });\n      const { data: invitedProfile } = await createSupabaseAdminClient().from("profiles").select("id").eq("email", email).maybeSingle();\n      if (invitedProfile?.id) await runSignupSideEffectsAsync({ supabase, userId: invitedProfile.id, plan, origin, fullName, email, phone, username, utmSource, utmCampaign });`,
);

replaceExact(
  "capturar usuário do cadastro pago",
  `      await withTimeout(\n        createPaidCheckoutAccount({`,
  `      const paidUserId = await withTimeout(\n        createPaidCheckoutAccount({`,
);

replaceExact(
  "vincular evento interno do cadastro pago",
  `        supabase,\n        plan,\n        origin,`,
  `        supabase,\n        userId: paidUserId,\n        plan,\n        origin,`,
);

replaceExact(
  "vincular evento interno do cadastro free",
  `  await runSignupSideEffectsAsync({ supabase, plan, origin, fullName, email, phone, username, utmSource, utmCampaign });`,
  `  await runSignupSideEffectsAsync({ supabase, userId, plan, origin, fullName, email, phone, username, utmSource, utmCampaign });`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[signup communication patch] Cadastro conectado à Central interna com sucesso.");
