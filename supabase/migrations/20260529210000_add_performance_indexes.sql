-- Índices seguros e não destrutivos para melhorar consultas frequentes do Harmomus.
-- Esta migration evita constraints únicas para não falhar caso já exista dado legado duplicado.

-- Assinaturas / reconhecimento de plano
create index if not exists idx_subscriptions_user_updated_at
  on public.subscriptions (user_id, updated_at desc);

create index if not exists idx_subscriptions_user_status
  on public.subscriptions (user_id, status);

create index if not exists idx_subscriptions_stripe_subscription_id
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

create index if not exists idx_subscriptions_stripe_customer_id
  on public.subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists idx_subscriptions_gateway_customer_id
  on public.subscriptions (gateway_customer_id)
  where gateway_customer_id is not null;

-- Perfis / login / migração
create index if not exists idx_profiles_email_lower
  on public.profiles (lower(email));

create index if not exists idx_profiles_role
  on public.profiles (role);

-- Kits / listagens / busca
create index if not exists idx_kits_published_created_at
  on public.kits (published, created_at desc);

create index if not exists idx_kits_slug_published
  on public.kits (slug, published);

create index if not exists idx_kits_category_id
  on public.kits (category_id);

-- Áudios / player / tons
create index if not exists idx_kit_audio_files_id_kit_id
  on public.kit_audio_files (id, kit_id);

create index if not exists idx_kit_audio_files_kit_tone_name
  on public.kit_audio_files (kit_id, tone, name);

create index if not exists idx_kit_audio_files_kit_source
  on public.kit_audio_files (kit_id, source_type);

-- Playlists
create index if not exists idx_playlists_user_created_at
  on public.playlists (user_id, created_at desc);

create index if not exists idx_playlists_user_slug
  on public.playlists (user_id, slug);

create index if not exists idx_playlist_items_playlist_position
  on public.playlist_items (playlist_id, position);

create index if not exists idx_playlist_items_kit_id
  on public.playlist_items (kit_id);

-- Favoritos
create index if not exists idx_kit_favorites_user_created_at
  on public.kit_favorites (user_id, created_at desc);

create index if not exists idx_kit_favorites_user_kit
  on public.kit_favorites (user_id, kit_id);

-- Ministério
create index if not exists idx_ministry_members_ministry_status
  on public.ministry_members (ministry_id, status);

create index if not exists idx_ministry_members_user_status
  on public.ministry_members (user_id, status);

create index if not exists idx_ministry_members_invite_token
  on public.ministry_members (invite_token)
  where invite_token is not null;

create index if not exists idx_ministry_members_invited_email_lower
  on public.ministry_members (lower(invited_email));

create index if not exists idx_ministries_owner_status
  on public.ministries (owner_id, status);

-- Controle Free / analytics de acesso
create index if not exists idx_kit_access_logs_user_accessed_at
  on public.kit_access_logs (user_id, accessed_at desc);

create index if not exists idx_kit_access_logs_user_kit_accessed_at
  on public.kit_access_logs (user_id, kit_id, accessed_at desc);

create index if not exists idx_audio_access_logs_user_accessed_at
  on public.audio_access_logs (user_id, accessed_at desc);

create index if not exists idx_audio_access_logs_kit_accessed_at
  on public.audio_access_logs (kit_id, accessed_at desc);

create index if not exists idx_audio_access_logs_audio_file_accessed_at
  on public.audio_access_logs (audio_file_id, accessed_at desc);

-- Eventos / webhooks / comunicação
create index if not exists idx_marketing_events_user_created_at
  on public.marketing_events (user_id, created_at desc);

create index if not exists idx_marketing_events_action_created_at
  on public.marketing_events (action, created_at desc);

create index if not exists idx_billing_events_provider_payload_id
  on public.billing_events (provider, ((payload ->> 'id')));

create index if not exists idx_billing_events_provider_processed_created_at
  on public.billing_events (provider, processed, created_at desc);

create index if not exists idx_webhook_processed_events_provider_event_id
  on public.webhook_processed_events (provider, event_id);
