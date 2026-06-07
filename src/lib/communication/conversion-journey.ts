import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient> & any;

export async function upsertQueuedConversionJourney(input: {
  admin: SupabaseAdmin;
  userId: string;
  automationId: string;
  campaignId: string;
  queueId: string | null;
  automationRunId?: string | null;
  firstEventId?: string | null;
  firstEventKey?: string | null;
  dominantIntent: string;
  channel: "whatsapp" | "email" | "app";
  score: number;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();

  const { data: existing } = await input.admin
    .from("marketing_conversion_journeys")
    .select("id,status")
    .eq("user_id", input.userId)
    .eq("dominant_intent", input.dominantIntent)
    .in("status", ["started", "queued", "sent", "clicked", "checkout_started"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    user_id: input.userId,
    automation_id: input.automationId,
    campaign_id: input.campaignId,
    queue_id: input.queueId,
    automation_run_id: input.automationRunId ?? null,
    first_event_id: input.firstEventId ?? null,
    first_event_key: input.firstEventKey ?? null,
    dominant_intent: input.dominantIntent,
    channel: input.channel,
    status: "queued",
    score: input.score,
    queued_at: now,
    metadata: input.metadata ?? {},
    updated_at: now,
  };

  if (existing?.id) {
    await input.admin.from("marketing_conversion_journeys").update(payload).eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await input.admin
    .from("marketing_conversion_journeys")
    .insert({ ...payload, started_at: now, created_at: now })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function markCheckoutStartedForUser(input: {
  admin: SupabaseAdmin;
  userId: string;
  planSlug?: string | null;
  eventId?: string | null;
}) {
  const { error } = await input.admin.rpc("marketing_mark_checkout_started", {
    p_user_id: input.userId,
    p_plan_slug: input.planSlug ?? null,
    p_event_id: input.eventId ?? null,
  });

  if (error && error.code !== "42883") {
    console.warn("[marketing.journey] falha ao marcar checkout_started", error);
  }
}

export async function markConversionCompletedForUser(input: {
  admin: SupabaseAdmin;
  userId: string;
  planSlug?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  source?: string | null;
  eventId?: string | null;
}) {
  const { error } = await input.admin.rpc("marketing_mark_conversion_completed", {
    p_user_id: input.userId,
    p_plan_slug: input.planSlug ?? null,
    p_amount_cents: input.amountCents ?? null,
    p_currency: input.currency ?? "brl",
    p_source: input.source ?? "stripe",
    p_event_id: input.eventId ?? null,
  });

  if (error && error.code !== "42883") {
    console.warn("[marketing.journey] falha ao marcar conversão", error);
  }
}
