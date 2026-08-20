import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getFocoOsCommunicationTokenDiagnostics() {
  const processValue = String(process.env.FOCO_OS_COMMUNICATION_TOKEN || "").trim();
  let bindingValue = "";
  let bindingReadable = false;
  let bindingError = "";

  try {
    const context = await getCloudflareContext({ async: true });
    bindingReadable = true;
    const env = context.env as Record<string, unknown>;
    bindingValue = String(env.FOCO_OS_COMMUNICATION_TOKEN || "").trim();
  } catch (error) {
    bindingError = error instanceof Error ? error.message : "cloudflare_context_error";
    console.warn("[foco-os-token] não foi possível ler binding do Cloudflare", error);
  }

  return {
    processEnv: Boolean(processValue),
    cloudflareContext: bindingReadable,
    cloudflareBinding: Boolean(bindingValue),
    tokenResolved: Boolean(bindingValue || processValue),
    source: bindingValue ? "cloudflare_binding" : processValue ? "process_env" : "none",
    ...(bindingError ? { bindingError } : {}),
  } as const;
}

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
