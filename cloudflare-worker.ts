// Cloudflare Worker wrapper for the OpenNext generated worker.
// The OpenNext build creates .open-next/worker.js. This wrapper preserves
// normal HTTP handling and adds a cron handler for the communication engine.

// @ts-expect-error .open-next/worker.js is generated during deployment.
import openNextWorker from "./.open-next/worker.js";
import { processBehaviorMarketingAutomations } from "./src/lib/communication/automation-engine";
import { processCommunicationQueue } from "./src/lib/communication/marketing-queue";

async function processCommunicationEngineFromCron() {
  console.log("Communication engine cron started.");

  try {
    const automationResult = await processBehaviorMarketingAutomations({ limit: 1000 });
    console.log("Behavior automations cron processed.", JSON.stringify(automationResult));
  } catch (error) {
    console.error(
      "Behavior automations cron failed.",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const queueResult = await processCommunicationQueue(1);
    console.log("Communication queue cron processed.", JSON.stringify(queueResult));
  } catch (error) {
    console.error(
      "Communication queue cron failed.",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export default {
  fetch(request: Request, env: unknown, ctx: unknown) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(_event: unknown, _env: unknown, ctx: { waitUntil: (promise: Promise<unknown>) => void }) {
    ctx.waitUntil(processCommunicationEngineFromCron());
  },
};
