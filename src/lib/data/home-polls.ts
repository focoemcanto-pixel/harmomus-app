import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface HomePollOptionResult {
  id: string;
  label: string;
  artist: string | null;
  description: string | null;
  order_index: number;
  voteCount: number;
  percent: number;
}

export interface HomePollResult {
  id: string;
  eyebrow: string;
  question: string;
  title: string | null;
  subtitle: string | null;
  active: boolean;
  totalVotes: number;
  userVoteOptionId: string | null;
  options: HomePollOptionResult[];
}

export interface AdminHomePoll extends HomePollResult {
  allow_guests: boolean;
  order_index: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

function isMissingTableError(error: unknown) {
  const maybeError = error as { code?: string; message?: string; details?: string } | null;
  const message = `${maybeError?.message ?? ""} ${maybeError?.details ?? ""}`.toLowerCase();

  return (
    maybeError?.code === "42P01" ||
    maybeError?.code === "PGRST205" ||
    (message.includes("home_poll") &&
      (message.includes("does not exist") ||
        message.includes("schema cache") ||
        message.includes("could not find the table")))
  );
}

function mapResults({ poll, options, votes, userVoteOptionId }: { poll: any; options: any[]; votes: any[]; userVoteOptionId?: string | null }): HomePollResult {
  const voteCountByOption = new Map<string, number>();
  for (const vote of votes ?? []) {
    if (!vote?.option_id) continue;
    voteCountByOption.set(vote.option_id, (voteCountByOption.get(vote.option_id) ?? 0) + 1);
  }

  const totalVotes = Array.from(voteCountByOption.values()).reduce((sum, count) => sum + count, 0);
  const mappedOptions = (options ?? []).map((option: any) => {
    const voteCount = voteCountByOption.get(option.id) ?? 0;
    const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
    return {
      id: option.id,
      label: option.label,
      artist: option.artist ?? null,
      description: option.description ?? null,
      order_index: option.order_index ?? 0,
      voteCount,
      percent,
    };
  });

  return {
    id: poll.id,
    eyebrow: poll.eyebrow ?? "Enquete Premium",
    question: poll.question,
    title: poll.title ?? null,
    subtitle: poll.subtitle ?? null,
    active: Boolean(poll.active),
    totalVotes,
    userVoteOptionId: userVoteOptionId ?? null,
    options: mappedOptions,
  };
}

async function resolveCurrentVoteOptionId(supabase: any, pollId: string, visitorId?: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  if (userId) {
    const { data } = await supabase
      .from("home_poll_votes")
      .select("option_id")
      .eq("poll_id", pollId)
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.option_id) return data.option_id as string;
  }

  if (visitorId) {
    const { data } = await supabase
      .from("home_poll_votes")
      .select("option_id")
      .eq("poll_id", pollId)
      .eq("visitor_id", visitorId)
      .maybeSingle();
    if (data?.option_id) return data.option_id as string;
  }

  return null;
}

export async function getActiveHomePoll(visitorId?: string | null): Promise<HomePollResult | null> {
  const supabase = (await createClient()) as any;
  const now = new Date().toISOString();

  const { data: poll, error } = await supabase
    .from("home_polls")
    .select("*")
    .eq("active", true)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(`Falha ao buscar enquete ativa: ${error.message}`);
  }
  if (!poll?.id) return null;

  const [{ data: options, error: optionsError }, { data: votes, error: votesError }, userVoteOptionId] = await Promise.all([
    supabase.from("home_poll_options").select("*").eq("poll_id", poll.id).order("order_index", { ascending: true }),
    supabase.from("home_poll_votes").select("option_id").eq("poll_id", poll.id),
    resolveCurrentVoteOptionId(supabase, poll.id, visitorId),
  ]);

  if (optionsError) throw new Error(`Falha ao buscar opções da enquete: ${optionsError.message}`);
  if (votesError) throw new Error(`Falha ao buscar votos da enquete: ${votesError.message}`);

  const result = mapResults({ poll, options: options ?? [], votes: votes ?? [], userVoteOptionId });
  return result.options.length ? result : null;
}

export async function getAdminHomePolls(): Promise<AdminHomePoll[]> {
  const supabase = (await createClient()) as any;
  const { data: polls, error } = await supabase
    .from("home_polls")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`Falha ao listar enquetes: ${error.message}`);
  }

  if (!polls?.length) return [];
  const pollIds = polls.map((poll: any) => poll.id);

  const [{ data: options, error: optionsError }, { data: votes, error: votesError }] = await Promise.all([
    supabase.from("home_poll_options").select("*").in("poll_id", pollIds).order("order_index", { ascending: true }),
    supabase.from("home_poll_votes").select("poll_id,option_id").in("poll_id", pollIds),
  ]);

  if (optionsError) throw new Error(`Falha ao buscar opções: ${optionsError.message}`);
  if (votesError) throw new Error(`Falha ao buscar votos: ${votesError.message}`);

  return polls.map((poll: any) => ({
    ...mapResults({
      poll,
      options: (options ?? []).filter((option: any) => option.poll_id === poll.id),
      votes: (votes ?? []).filter((vote: any) => vote.poll_id === poll.id),
    }),
    allow_guests: Boolean(poll.allow_guests),
    order_index: poll.order_index ?? 0,
    starts_at: poll.starts_at ?? null,
    ends_at: poll.ends_at ?? null,
    created_at: poll.created_at,
    updated_at: poll.updated_at,
  }));
}

export async function createHomePoll(payload: {
  eyebrow: string;
  question: string;
  title?: string | null;
  subtitle?: string | null;
  active: boolean;
  allow_guests: boolean;
  order_index: number;
  options: { label: string; artist?: string | null; description?: string | null; order_index: number }[];
}) {
  const supabase = createSupabaseAdminClient() as any;
  const options = payload.options.filter((option) => option.label.trim());
  if (!payload.question.trim()) throw new Error("Pergunta obrigatória.");
  if (options.length < 2) throw new Error("Cadastre pelo menos 2 músicas para a enquete.");

  const { data: poll, error } = await supabase
    .from("home_polls")
    .insert({
      eyebrow: payload.eyebrow.trim() || "Enquete Premium",
      question: payload.question.trim(),
      title: payload.title?.trim() || null,
      subtitle: payload.subtitle?.trim() || null,
      active: payload.active,
      allow_guests: payload.allow_guests,
      order_index: payload.order_index,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Falha ao criar enquete: ${error.message}`);

  const rows = options.map((option, index) => ({
    poll_id: poll.id,
    label: option.label.trim(),
    artist: option.artist?.trim() || null,
    description: option.description?.trim() || null,
    order_index: option.order_index || index + 1,
  }));

  const { error: optionsError } = await supabase.from("home_poll_options").insert(rows);
  if (optionsError) {
    await supabase.from("home_polls").delete().eq("id", poll.id);
    throw new Error(`Falha ao criar opções da enquete: ${optionsError.message}`);
  }
}

export async function updateHomePoll(payload: {
  id: string;
  eyebrow: string;
  question: string;
  title?: string | null;
  subtitle?: string | null;
  active: boolean;
  allow_guests: boolean;
  order_index: number;
  options: { id?: string | null; label: string; artist?: string | null; description?: string | null; order_index: number }[];
}) {
  const supabase = createSupabaseAdminClient() as any;
  const options = payload.options.filter((option) => option.label.trim());
  if (!payload.id) throw new Error("Enquete inválida.");
  if (!payload.question.trim()) throw new Error("Pergunta obrigatória.");
  if (options.length < 2) throw new Error("Mantenha pelo menos 2 músicas na enquete.");

  const { error } = await supabase
    .from("home_polls")
    .update({
      eyebrow: payload.eyebrow.trim() || "Enquete Premium",
      question: payload.question.trim(),
      title: payload.title?.trim() || null,
      subtitle: payload.subtitle?.trim() || null,
      active: payload.active,
      allow_guests: payload.allow_guests,
      order_index: payload.order_index,
    })
    .eq("id", payload.id);

  if (error) throw new Error(`Falha ao atualizar enquete: ${error.message}`);

  await supabase.from("home_poll_options").delete().eq("poll_id", payload.id);

  const rows = options.map((option, index) => ({
    poll_id: payload.id,
    label: option.label.trim(),
    artist: option.artist?.trim() || null,
    description: option.description?.trim() || null,
    order_index: option.order_index || index + 1,
  }));

  const { error: optionsError } = await supabase.from("home_poll_options").insert(rows);
  if (optionsError) throw new Error(`Falha ao salvar opções da enquete: ${optionsError.message}`);
}

export async function deleteHomePoll(id: string) {
  const supabase = createSupabaseAdminClient() as any;
  const { error } = await supabase.from("home_polls").delete().eq("id", id);
  if (error) throw new Error(`Falha ao excluir enquete: ${error.message}`);
}
