import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type MarketingEngineSettings = {
  id: boolean;
  production_enabled: boolean;
  processing_interval_minutes: number;
  max_automation_events_per_run: number;
  max_queue_messages_per_run: number;
  daily_message_limit_per_user: number;
  last_automation_run_at: string | null;
  last_queue_run_at: string | null;
  last_result: Record<string, unknown> | null;
  paused_reason: string | null;
  created_at: string;
  updated_at: string;
};

export const DEFAULT_ENGINE_SETTINGS: MarketingEngineSettings = {
  id: true,
  production_enabled: false,
  processing_interval_minutes: 5,
  max_automation_events_per_run: 1000,
  max_queue_messages_per_run: 2,
  daily_message_limit_per_user: 3,
  last_automation_run_at: null,
  last_queue_run_at: null,
  last_result: {},
  paused_reason: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export async function getMarketingEngineSettings(admin = createSupabaseAdminClient() as any) {
  const { data, error } = await admin
    .from("marketing_engine_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") return { data: DEFAULT_ENGINE_SETTINGS, error: null, missingTable: true };
    return { data: DEFAULT_ENGINE_SETTINGS, error, missingTable: false };
  }

  return { data: (data ?? DEFAULT_ENGINE_SETTINGS) as MarketingEngineSettings, error: null, missingTable: false };
}

export async function updateMarketingEngineSettings(
  patch: Partial<Pick<MarketingEngineSettings, "production_enabled" | "paused_reason" | "last_automation_run_at" | "last_queue_run_at" | "last_result">>,
  admin = createSupabaseAdminClient() as any,
) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("marketing_engine_settings")
    .upsert(
      {
        id: true,
        ...patch,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  return { data: data as MarketingEngineSettings | null, error };
}
