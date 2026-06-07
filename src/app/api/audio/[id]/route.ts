  kitCache.set(kitId, { value, expiresAt: nowMs() + KIT_META_CACHE_TTL_MS });
  return { data: value, cacheHit: false, durationMs: nowMs() - startedAt };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = nowMs();
  const { id } = await params;
  const range = parseRangeHeader(request.headers.get("range"));
  const rangeLabel = request.headers.get("range") ?? "full";
  const supabase = await createClient();

  const audioFileResult = await getCachedAudioFile(supabase as any, id);
  const audioFile = audioFileResult.data;
  const audioFileMs = audioFileResult.durationMs;

  if (!audioFile) {
    logAudioRoutePerf(id, "not_found", { totalMs: nowMs() - startedAt, audioFileMs, audioFileCacheHit: audioFileResult.cacheHit, range: rangeLabel });
    return new Response("Áudio não encontrado.", { status: 404 });
  }
  if (!audioFile.r2_key) return new Response("Áudio indisponível.", { status: 502 });

  const parallelStartedAt = nowMs();
  const [kitResult, plansResult, context] = await Promise.all([
    getCachedKit(supabase as any, audioFile.kit_id),
    getCachedPlans(supabase as any),
    getCurrentUserAccessContext(),
  ]);
  const parallelMs = nowMs() - parallelStartedAt;
  const kit = kitResult.data;
  const plans = plansResult.plans;

  if (!kit) {
    logAudioRoutePerf(id, "kit_not_found", { totalMs: nowMs() - startedAt, audioFileMs, parallelMs, audioFileCacheHit: audioFileResult.cacheHit, kitCacheHit: kitResult.cacheHit, range: rangeLabel });
    return new Response("Kit não encontrado.", { status: 404 });
  }

  const requiredPlan = resolveRequiredPlan(plans, kit.required_plan);
  const accessKit: PublicKit = {
    id: kit.id,
    slug: kit.slug,
    name: kit.name,
    artist: kit.artist,
    coverUrl: kit.cover_url,
    description: kit.description,
    lyrics: kit.lyrics,
    originalTone: kit.original_tone ?? null,
    defaultTone: kit.default_tone ?? kit.original_tone ?? null,
    allowPitchShift: kit.allow_pitch_shift ?? true,
    maxPitchShiftSemitones: kit.max_pitch_shift_semitones ?? 2,
    manualTessituraRanges: [],
    category: null,
    requiredPlan,
    allowedPlanSlugs: Array.isArray(kit.allowed_plan_slugs) && kit.allowed_plan_slugs.length ? kit.allowed_plan_slugs : requiredPlan?.slug === "premium" ? ["premium"] : requiredPlan?.slug === "plus" ? ["plus", "premium"] : ["free", "plus", "premium"],
    tones: [],
  };

  const accessStartedAt = nowMs();
  const access = await resolveKitAccess(context, accessKit);
  const accessMs = nowMs() - accessStartedAt;
  const analyticsContext = { session_id: resolveSessionId(request), device_type: resolveDeviceType(request.headers.get("user-agent")), plan_slug: context.effectiveSlug, page_path: resolvePagePath(request) };

  if (!access.play.allowed) {
    await logAudioAccess({ user_id: context.profile?.id ?? null, kit_id: kit.id, audio_file_id: audioFile.id, status: "denied", reason: access.play.reason, ...analyticsContext });
    return new Response("Acesso negado a este áudio.", { status: 403 });
  }

  if (!access.tone.allowed) {
