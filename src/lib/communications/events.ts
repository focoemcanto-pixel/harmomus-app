import { SupabaseClient } from "@supabase/supabase-js";

export async function trackMarketingEvent(
  supabase: SupabaseClient,
  input: {
    userId?: string | null;
    eventKey: string;
    eventLabel?: string;
    channel?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("marketing_events").insert({
    user_id: input.userId ?? null,
    event_key: input.eventKey,
    event_label: input.eventLabel ?? input.eventKey,
    channel: input.channel ?? null,
    source: input.source ?? "harmomus",
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw new Error(`Falha ao registrar evento de comunicação ${input.eventKey}: ${error.message}`);
  }
}
