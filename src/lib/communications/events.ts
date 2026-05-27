import { SupabaseClient } from "@supabase/supabase-js";

export async function trackMarketingEvent(supabase: SupabaseClient, input: { userId?: string | null; eventType: string; channel?: string; metadata?: Record<string, unknown> }) {
  await supabase.from("marketing_events").insert({
    user_id: input.userId ?? null,
    event_type: input.eventType,
    channel: input.channel ?? null,
    metadata: input.metadata ?? {},
  });
}
