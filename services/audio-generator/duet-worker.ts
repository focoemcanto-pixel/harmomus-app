import { processDuetRenderJob, reserveDuetRenderJob } from "./render-duet-job";

const pollMs = Number(process.env.DUET_RENDER_POLL_MS || 3000);

async function main() {
  const enabled = String(process.env.ENABLE_DUET_RENDER_JOBS ?? "false").toLowerCase() === "true";
  console.info("[duet-render-worker] started", { enabled, pollMs });

  if (!enabled) {
    console.warn("[duet-render-worker] ENABLE_DUET_RENDER_JOBS is not true. Worker will stay idle.");
  }

  while (true) {
    try {
      const job = await reserveDuetRenderJob();
      if (job) {
        await processDuetRenderJob(job);
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    } catch (error) {
      console.error("[duet-render-worker] fatal loop error", error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error("[duet-render-worker] unhandled fatal error", error);
  process.exit(1);
});
