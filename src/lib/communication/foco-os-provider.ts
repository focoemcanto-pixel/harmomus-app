import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const INTERNAL_PROVIDER_URL = "https://harmomus.com/api/internal/foco-os-provider";

export async function ensureFocoOsManualProvider() {
  const token = String(process.env.FOCO_OS_COMMUNICATION_TOKEN || "").trim();
  if (!token) {
    return { ready: false, changed: false, reason: "missing_token" as const };
  }

  const admin = createSupabaseAdminClient();
  const { data: active, error } = await admin
    .from("communication_whatsapp_integrations")
    .select("id,name,provider,config,active")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const config = (active?.config && typeof active.config === "object")
    ? active.config as Record<string, unknown>
    : {};
  const alreadyManaged = active?.provider === "custom" && config.apiUrl === INTERNAL_PROVIDER_URL && config.mode === "foco_os_manual";

  if (alreadyManaged) return { ready: true, changed: false };

  const managedConfig = {
    apiUrl: INTERNAL_PROVIDER_URL,
    testPhone: typeof config.testPhone === "string" && config.testPhone.trim() ? config.testPhone : "5571993392294",
    mode: "foco_os_manual",
    managed: true,
  };

  if (active?.id) {
    const { error: updateError } = await admin
      .from("communication_whatsapp_integrations")
      .update({
        name: "Foco OS — envio manual",
        provider: "custom",
        config: managedConfig,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.id);
    if (updateError) throw updateError;
    return { ready: true, changed: true };
  }

  const { error: insertError } = await admin
    .from("communication_whatsapp_integrations")
    .insert({
      name: "Foco OS — envio manual",
      type: "whatsapp",
      provider: "custom",
      active: true,
      config: managedConfig,
      limits: {
        perMinute: 12,
        perHour: 20,
        perDay: 120,
        delayMin: 180,
        delayMax: 300,
        pauseEvery: 10,
        pauseMinutes: 15,
      },
    });
  if (insertError) throw insertError;

  return { ready: true, changed: true };
}
