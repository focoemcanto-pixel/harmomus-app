import { SupabaseClient } from "@supabase/supabase-js";

export async function trackMarketingEvent(supabase: SupabaseClient, input: { userId?: string | null; eventType: string; channel?: string; metadata?: Record<string, unknown> }) {
  const baseRecord = {
    user_id: input.userId ?? null,
    event_type: input.eventType,
    channel: input.channel ?? null,
    metadata: input.metadata ?? {},
  };

  const { error } = await supabase.from("marketing_events").insert({
    ...baseRecord,
    action: input.eventType,
  });

  if (error?.code === "PGRST204" || error?.code === "42703") {
    await supabase.from("marketing_events").insert(baseRecord);
  }
}
