import { NextResponse } from "next/server";

import { getCurrentUserAccessContext } from "@/lib/auth/current-user";
import { FEEDBACK_NEEDS, PRODUCT_FEEDBACK_SURVEY_KEY } from "@/lib/feedback-survey-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const allowedNeeds = new Set(FEEDBACK_NEEDS.map((item) => item.value));

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy.toISOString();
}

async function recordEvent(supabase: any, userId: string, action: string, metadata: Record<string, unknown>) {
  await supabase.from("usage_tracking").insert({
    user_id: userId,
    action,
    metadata,
  });
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentUserAccessContext();
    if (context.isGuest || !context.profile?.id || context.isAdmin) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const action = String(body?.action ?? "").trim();
    const surveyKey = String(body?.surveyKey ?? PRODUCT_FEEDBACK_SURVEY_KEY).trim();

    if (surveyKey !== PRODUCT_FEEDBACK_SURVEY_KEY) {
      return NextResponse.json({ error: "Pesquisa inválida" }, { status: 400 });
    }

    const userId = context.profile.id;
    const supabase = createSupabaseAdminClient() as any;
    const now = new Date();

    if (action === "impression") {
      const { data: state } = await supabase
        .from("feedback_survey_states")
        .select("answered_at,next_eligible_at,dismiss_count")
        .eq("user_id", userId)
        .eq("survey_key", surveyKey)
        .maybeSingle();

      if (state?.answered_at) return NextResponse.json({ success: true, suppressed: true });
      if (state?.next_eligible_at && new Date(state.next_eligible_at).getTime() > now.getTime()) {
        return NextResponse.json({ success: true, suppressed: true });
      }

      await supabase.from("feedback_survey_states").upsert({
        user_id: userId,
        survey_key: surveyKey,
        dismiss_count: Number(state?.dismiss_count ?? 0),
        last_shown_at: now.toISOString(),
        next_eligible_at: addDays(now, 1),
        updated_at: now.toISOString(),
      }, { onConflict: "user_id,survey_key" });

      await recordEvent(supabase, userId, "feedback_survey_shown", {
        surveyKey,
        plan: context.effectiveSlug,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "dismiss") {
      const { data: state } = await supabase
        .from("feedback_survey_states")
        .select("dismiss_count,answered_at")
        .eq("user_id", userId)
        .eq("survey_key", surveyKey)
        .maybeSingle();

      if (state?.answered_at) return NextResponse.json({ success: true });

      const dismissCount = Number(state?.dismiss_count ?? 0) + 1;
      const waitDays = dismissCount === 1 ? 7 : dismissCount === 2 ? 14 : 60;

      await supabase.from("feedback_survey_states").upsert({
        user_id: userId,
        survey_key: surveyKey,
        dismiss_count: dismissCount,
        last_shown_at: now.toISOString(),
        next_eligible_at: addDays(now, waitDays),
        updated_at: now.toISOString(),
      }, { onConflict: "user_id,survey_key" });

      await recordEvent(supabase, userId, "feedback_survey_dismissed", {
        surveyKey,
        dismissCount,
        waitDays,
        plan: context.effectiveSlug,
      });

      return NextResponse.json({ success: true, dismissCount, waitDays });
    }

    if (action === "submit") {
      const rating = Number(body?.rating ?? 0);
      const primaryNeed = String(body?.primaryNeed ?? "").trim();
      const songRequest = String(body?.songRequest ?? "").trim().slice(0, 160);
      const comment = String(body?.comment ?? "").trim().slice(0, 600);

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: "Escolha uma nota de 1 a 5." }, { status: 400 });
      }
      if (!allowedNeeds.has(primaryNeed as any)) {
        return NextResponse.json({ error: "Escolha o que mais faria diferença para você." }, { status: 400 });
      }

      const { error: responseError } = await supabase.from("feedback_survey_responses").upsert({
        user_id: userId,
        survey_key: surveyKey,
        rating,
        primary_need: primaryNeed,
        song_request: songRequest || null,
        comment: comment || null,
        plan_slug: context.effectiveSlug,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id,survey_key" });

      if (responseError) throw responseError;

      await supabase.from("feedback_survey_states").upsert({
        user_id: userId,
        survey_key: surveyKey,
        answered_at: now.toISOString(),
        next_eligible_at: null,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id,survey_key" });

      await recordEvent(supabase, userId, "feedback_survey_answered", {
        surveyKey,
        rating,
        primaryNeed,
        hasSongRequest: Boolean(songRequest),
        hasComment: Boolean(comment),
        plan: context.effectiveSlug,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
