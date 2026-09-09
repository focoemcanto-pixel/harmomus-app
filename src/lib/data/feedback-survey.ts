import { FEEDBACK_NEEDS, PRODUCT_FEEDBACK_SURVEY_KEY, type FeedbackNeed } from "@/lib/feedback-survey-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FeedbackPeriod = "7" | "30" | "90";

function sinceDate(period: FeedbackPeriod = "30") {
  const date = new Date();
  date.setDate(date.getDate() - Number(period) + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export async function getFeedbackSurveyEligibility(input: {
  userId?: string | null;
  isGuest: boolean;
  isAdmin: boolean;
}) {
  const { userId, isGuest, isAdmin } = input;
  if (!userId || isGuest || isAdmin) return { eligible: false, surveyKey: PRODUCT_FEEDBACK_SURVEY_KEY };

  const supabase = createSupabaseAdminClient() as any;
  const { data: state } = await supabase
    .from("feedback_survey_states")
    .select("dismiss_count,next_eligible_at,answered_at,last_shown_at")
    .eq("user_id", userId)
    .eq("survey_key", PRODUCT_FEEDBACK_SURVEY_KEY)
    .maybeSingle();

  if (state?.answered_at) return { eligible: false, surveyKey: PRODUCT_FEEDBACK_SURVEY_KEY };
  if (state?.next_eligible_at && new Date(state.next_eligible_at).getTime() > Date.now()) {
    return { eligible: false, surveyKey: PRODUCT_FEEDBACK_SURVEY_KEY };
  }

  const [{ count: audioCount }, { count: searchCount }] = await Promise.all([
    supabase.from("audio_access_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "allowed"),
    supabase.from("usage_tracking").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("action", "catalog_search"),
  ]);

  const engagementCount = Number(audioCount ?? 0) + Number(searchCount ?? 0);
  return {
    eligible: engagementCount >= 5,
    surveyKey: PRODUCT_FEEDBACK_SURVEY_KEY,
    engagementCount,
    dismissCount: Number(state?.dismiss_count ?? 0),
  };
}

export async function getAdminFeedbackDashboard(period: FeedbackPeriod = "30") {
  const supabase = createSupabaseAdminClient() as any;
  const since = sinceDate(period);

  const [responsesResult, eventsResult] = await Promise.all([
    supabase
      .from("feedback_survey_responses")
      .select("id,user_id,rating,primary_need,song_request,comment,plan_slug,created_at,profiles(full_name,email)")
      .eq("survey_key", PRODUCT_FEEDBACK_SURVEY_KEY)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("usage_tracking")
      .select("id,user_id,action,metadata,created_at")
      .in("action", ["feedback_survey_shown", "feedback_survey_dismissed", "feedback_survey_answered"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000),
  ]);

  const responses = (responsesResult.data ?? []) as any[];
  const events = (eventsResult.data ?? []) as any[];
  const shown = events.filter((row) => row.action === "feedback_survey_shown").length;
  const dismissed = events.filter((row) => row.action === "feedback_survey_dismissed").length;
  const answeredEvents = events.filter((row) => row.action === "feedback_survey_answered").length;
  const avgRating = responses.length
    ? Number((responses.reduce((sum, row) => sum + Number(row.rating ?? 0), 0) / responses.length).toFixed(1))
    : 0;

  const needMap = new Map<string, number>();
  const ratingMap = new Map<number, number>();
  const songMap = new Map<string, number>();

  for (const row of responses) {
    const need = String(row.primary_need ?? "other");
    needMap.set(need, (needMap.get(need) ?? 0) + 1);
    const rating = Number(row.rating ?? 0);
    if (rating >= 1 && rating <= 5) ratingMap.set(rating, (ratingMap.get(rating) ?? 0) + 1);
    const song = String(row.song_request ?? "").trim();
    if (song) songMap.set(song, (songMap.get(song) ?? 0) + 1);
  }

  const needLabel = new Map(FEEDBACK_NEEDS.map((item) => [item.value, item.label]));
  const needs = Array.from(needMap.entries())
    .map(([key, value]) => ({ key, label: needLabel.get(key as FeedbackNeed) ?? key, value }))
    .sort((a, b) => b.value - a.value);

  const ratings = [5, 4, 3, 2, 1].map((rating) => ({ rating, value: ratingMap.get(rating) ?? 0 }));
  const songs = Array.from(songMap.entries())
    .map(([song, requests]) => ({ song, requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 20);

  return {
    summary: {
      responses: responses.length,
      avgRating,
      shown,
      dismissed,
      answeredEvents,
      responseRate: shown ? Number(((responses.length / shown) * 100).toFixed(1)) : 0,
      catalogNeed: responses.length ? Number((((needMap.get("catalog") ?? 0) / responses.length) * 100).toFixed(1)) : 0,
      songSuggestions: responses.filter((row) => String(row.song_request ?? "").trim()).length,
      comments: responses.filter((row) => String(row.comment ?? "").trim()).length,
    },
    needs,
    ratings,
    songs,
    recent: responses.slice(0, 50).map((row) => ({
      id: row.id,
      when: row.created_at ?? "",
      rating: Number(row.rating ?? 0),
      need: needLabel.get(String(row.primary_need ?? "other") as FeedbackNeed) ?? String(row.primary_need ?? "Outro"),
      song: String(row.song_request ?? "").trim(),
      comment: String(row.comment ?? "").trim(),
      plan: String(row.plan_slug ?? "não informado"),
      user: row.profiles?.full_name || row.profiles?.email || row.user_id || "Usuário não informado",
    })),
  };
}
