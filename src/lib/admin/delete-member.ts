import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseQuery = PromiseLike<{ error: { message?: string } | null }>;

async function safeDelete(query: SupabaseQuery, label: string) {
  try {
    const { error } = await query;
    if (error) console.warn(`[admin.membros] limpeza auxiliar ignorada em ${label}`, error.message ?? error);
  } catch (error) {
    console.warn(`[admin.membros] limpeza auxiliar ignorada em ${label}`, error);
  }
}

export async function deleteAdminMember(userId: string) {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error("Informe o membro que deve ser excluído.");

  const supabase = createSupabaseAdminClient() as any;
  const { data: playlists, error: playlistsError } = await supabase
    .from("playlists")
    .select("id")
    .eq("user_id", normalizedUserId);

  if (playlistsError) {
    throw new Error(playlistsError.message ?? "Não foi possível carregar playlists do membro.");
  }

  const playlistIds = (playlists ?? []).map((playlist: any) => playlist.id).filter(Boolean);

  if (playlistIds.length) {
    await safeDelete(supabase.from("playlist_items").delete().in("playlist_id", playlistIds), "playlist_items");
  }

  await safeDelete(supabase.from("playlists").delete().eq("user_id", normalizedUserId), "playlists");
  await safeDelete(supabase.from("kit_favorites").delete().eq("user_id", normalizedUserId), "kit_favorites");
  await safeDelete(supabase.from("premium_requests").delete().eq("user_id", normalizedUserId), "premium_requests");
  await safeDelete(supabase.from("audio_access_logs").delete().eq("user_id", normalizedUserId), "audio_access_logs");
  await safeDelete(supabase.from("kit_access_logs").delete().eq("user_id", normalizedUserId), "kit_access_logs");
  await safeDelete(supabase.from("communication_logs").delete().eq("user_id", normalizedUserId), "communication_logs");
  await safeDelete(supabase.from("subscriptions").delete().eq("user_id", normalizedUserId), "subscriptions");

  const { error: authError } = await supabase.auth.admin.deleteUser(normalizedUserId);
  if (authError) {
    throw new Error(authError.message ?? "Não foi possível excluir o login do membro no Auth.");
  }

  const { error: profileError } = await supabase.from("profiles").delete().eq("id", normalizedUserId);
  if (profileError) {
    throw new Error(profileError.message ?? "Não foi possível excluir o perfil do membro.");
  }
}
