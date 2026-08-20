import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "src/lib/communication/automation-engine-v2.ts");
let source = fs.readFileSync(filePath, "utf8");

function replaceExact(label, from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`[foco os delivery patch] Trecho não encontrado: ${label}`);
  source = source.replace(from, to);
}

replaceExact(
  "hasProcessedEvent por modo de entrega",
  `async function hasProcessedEvent(admin: SupabaseAdmin & any, automationId: string, eventId: string) {\n  const { data } = await admin.from("marketing_automation_runs")\n    .select("id")\n    .eq("automation_id", automationId)\n    .eq("trigger_event_id", eventId)\n    .in("status", ["queued", "skipped"])\n    .limit(1)\n    .maybeSingle();\n  return Boolean(data?.id);\n}`,
  `async function hasProcessedEvent(admin: SupabaseAdmin & any, automationId: string, eventId: string, deliveryMode?: string) {\n  if (deliveryMode) {\n    const { data } = await admin.from("communication_queue")\n      .select("id")\n      .eq("payload->>automation_id", automationId)\n      .eq("payload->>trigger_event_id", eventId)\n      .eq("payload->>delivery_mode", deliveryMode)\n      .limit(1)\n      .maybeSingle();\n    return Boolean(data?.id);\n  }\n\n  const { data } = await admin.from("marketing_automation_runs")\n    .select("id")\n    .eq("automation_id", automationId)\n    .eq("trigger_event_id", eventId)\n    .in("status", ["queued", "skipped"])\n    .limit(1)\n    .maybeSingle();\n  return Boolean(data?.id);\n}`,
);

replaceExact(
  "dedupe por modo de entrega",
  `async function hasRecentOrPendingAutomationJob(admin: SupabaseAdmin & any, automation: AutomationRow, userId: string) {\n  const since = hoursAgo(Math.max(24, automation.cooldown_hours || 24));\n  const { data } = await admin.from("communication_queue")\n    .select("id")\n    .eq("user_id", userId)\n    .eq("channel", automation.channel)\n    .eq("payload->>automation_id", automation.id)\n    .in("status", ["pending", "processing", "queued", "sent"])\n    .gte("created_at", since)\n    .limit(1)\n    .maybeSingle();\n  return Boolean(data?.id);\n}`,
  `async function hasRecentOrPendingAutomationJob(admin: SupabaseAdmin & any, automation: AutomationRow, userId: string, deliveryMode?: string) {\n  const since = hoursAgo(Math.max(24, automation.cooldown_hours || 24));\n  let query = admin.from("communication_queue")\n    .select("id")\n    .eq("user_id", userId)\n    .eq("channel", automation.channel)\n    .eq("payload->>automation_id", automation.id)\n    .in("status", ["pending", "processing", "queued", "sent"])\n    .gte("created_at", since);\n  if (deliveryMode) query = query.eq("payload->>delivery_mode", deliveryMode);\n  const { data } = await query.limit(1).maybeSingle();\n  return Boolean(data?.id);\n}`,
);

replaceExact(
  "enqueue recebe deliveryMode",
  `async function enqueue(admin: SupabaseAdmin & any, input: { automation: AutomationRow; campaignId: string; profile: ProfileRow; subscription?: SubscriptionRow | null; event: MarketingEventRow; score: number; scheduledAt?: string | null }) {`,
  `async function enqueue(admin: SupabaseAdmin & any, input: { automation: AutomationRow; campaignId: string; profile: ProfileRow; subscription?: SubscriptionRow | null; event: MarketingEventRow; score: number; scheduledAt?: string | null; deliveryMode?: string }) {`,
);

replaceExact(
  "dedupe enqueue por deliveryMode",
  `  if (await hasRecentOrPendingAutomationJob(admin, input.automation, input.profile.id)) return { queueId: null, reason: "duplicate_recent_or_pending_job" };`,
  `  if (await hasRecentOrPendingAutomationJob(admin, input.automation, input.profile.id, input.deliveryMode)) return { queueId: null, reason: "duplicate_recent_or_pending_job" };`,
);

replaceExact(
  "marcar deliveryMode no payload",
  `      transactional,\n    },`,
  `      transactional,\n      delivery_mode: input.deliveryMode ?? null,\n    },`,
);

replaceExact(
  "options recebe deliveryMode",
  `export async function processBehaviorMarketingAutomations(options: { dryRun?: boolean; limit?: number } = {}): Promise<ProcessResult> {`,
  `export async function processBehaviorMarketingAutomations(options: { dryRun?: boolean; limit?: number; deliveryMode?: string } = {}): Promise<ProcessResult> {`,
);

replaceExact(
  "hasProcessedEvent usa deliveryMode",
  `      for (const event of matching) if (!(await hasProcessedEvent(admin, automation.id, event.id))) unprocessed.push(event);`,
  `      for (const event of matching) if (!(await hasProcessedEvent(admin, automation.id, event.id, options.deliveryMode))) unprocessed.push(event);`,
);

replaceExact(
  "enqueue usa deliveryMode",
  `      const queued = await enqueue(admin, { automation: winner.automation, campaignId, profile, subscription, event: winner.latestEvent, score: winner.score, scheduledAt });`,
  `      const queued = await enqueue(admin, { automation: winner.automation, campaignId, profile, subscription, event: winner.latestEvent, score: winner.score, scheduledAt, deliveryMode: options.deliveryMode });`,
);

fs.writeFileSync(filePath, source, "utf8");
console.log("[foco os delivery patch] Modo de entrega manual isolado do histórico legado.");
