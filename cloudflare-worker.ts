// Cloudflare Worker wrapper for the OpenNext generated worker.
// The OpenNext build creates .open-next/worker.js. This wrapper preserves
// normal HTTP handling and adds a cron handler for the communication queue.

// @ts-expect-error .open-next/worker.js is generated during deployment.
import openNextWorker from "./.open-next/worker.js";

type Env = {
  HARMOMUS_WORKER_TOKEN?: string;
  HARMOMUS_APP_URL?: string;
};

function normalizeBaseUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.replace(/\/+$/, "");
}

async function processCommunicationQueueFromCron(env: Env) {
  const token = env.HARMOMUS_WORKER_TOKEN;
  const baseUrl = normalizeBaseUrl(env.HARMOMUS_APP_URL);

  if (!token) {
    console.error("HARMOMUS_WORKER_TOKEN is not configured.");
    return;
  }

  if (!baseUrl) {
    console.error("HARMOMUS_APP_URL is not configured.");
    return;
  }

  const response = await fetch(`${baseUrl}/api/workers/communication/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-harmomus-worker-token": token,
    },
    body: JSON.stringify({ limit: 1 }),
  });

  const body = await response.text().catch(() => "");

  if (!response.ok) {
    console.error("Communication queue cron failed.", {
      status: response.status,
      body: body.slice(0, 1000),
    });
    return;
  }

  console.log("Communication queue cron processed.", body.slice(0, 1000));
}

export default {
  fetch(request: Request, env: Env, ctx: any) {
    return openNextWorker.fetch(request, env, ctx);
  },

  async scheduled(_event: any, env: Env, ctx: any) {
    ctx.waitUntil(processCommunicationQueueFromCron(env));
  },
};
