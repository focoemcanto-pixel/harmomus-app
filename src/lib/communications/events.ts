import { SupabaseClient } from "@supabase/supabase-js";

export async function trackMarketingEvent(supabase: SupabaseClient, input: { userId?: string | null; eventKey: string; eventLabel?: string; channel?: string; metadata?: Record<string, unknown> }) {
  await supabase.from("marketing_events").insert({
    user_id: input.userId ?? null,
    event_key: input.eventKey,
    event_label: input.eventLabel ?? input.eventKey,
    channel: input.channel ?? null,
    metadata: input.metadata ?? {},
  });
}
