import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getFocoOsCommunicationToken() {
  const processValue = String(process.env.FOCO_OS_COMMUNICATION_TOKEN || "").trim();
  if (processValue) return processValue;

  try {
    const context = await getCloudflareContext({ async: true });
    const env = context.env as Record<string, unknown>;
    const bindingValue = String(env.FOCO_OS_COMMUNICATION_TOKEN || "").trim();
    if (bindingValue) return bindingValue;
  } catch (error) {
    console.warn("[foco-os-token] não foi possível ler binding do Cloudflare", error);
  }

  return "";
}
