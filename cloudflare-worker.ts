// Cloudflare Worker wrapper for the OpenNext generated worker.
// The OpenNext build creates .open-next/worker.js. This wrapper preserves
// normal HTTP handling and adds a cron handler for the communication engine.

// @ts-expect-error .open-next/worker.js is generated during deployment.
import openNextWorker from "./.open-next/worker.js";
import { getMarketingEngineSettings, updateMarketingEngineSettings } from "./src/lib/communication/engine-settings";
import { processBehaviorMarketingAutomations } from "./src/lib/communication/automation-engine-v2";
import { ensureFocoOsManualProvider } from "./src/lib/communication/foco-os-provider";
import { processCommunicationQueue } from "./src/lib/communication/marketing-queue";

async function processCommunicationEngineFromCron() {
  console.log("Communication engine cron started.");

  const settings = await getMarketingEngineSettings();
  if (!settings.data.production_enabled) {
    console.log("Communication engine cron skipped: production is paused.");
    return;
  }

  const result: Record<string, unknown> = {};
  const now = new Date().toISOString();

  try {
    const automationResult = await processBehaviorMarketingAutomations({
      limit: settings.data.max_automation_events_per_run || 1000,
    });
    result.automations = automationResult;
    console.log("Behavior automations cron processed.", JSON.stringify(automationResult));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.automation_error = message;
    console.error("Behavior automations cron failed.", message);
  }

  try {
    const provider = await ensureFocoOsManualProvider();
    result.provider = provider;
    const queueResult = await processCommunicationQueue(settings.data.max_queue_messages_per_run || 2);
    result.queue = queueResult;
    console.log("Communication queue cron processed.", JSON.stringify({ provider, queueResult }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.queue_error = message;
    console.error("Communication queue cron failed.", message);
  }

  await updateMarketingEngineSettings({
    last_automation_run_at: now,
    last_queue_run_at: now,
    last_result: result,
  });
}

export default {
  fetch(request: Request, env: unknown, ctx: unknown) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(_event: unknown, _env: unknown, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    ctx.waitUntil(processCommunicationEngineFromCron());
  },
};