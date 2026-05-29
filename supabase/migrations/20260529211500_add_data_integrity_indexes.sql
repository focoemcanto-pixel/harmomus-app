-- Índices únicos para impedir duplicidades críticas no Harmomus.
-- Aplicar somente após confirmar que as consultas de duplicidade retornaram zero linhas.

-- Cada usuário deve ter no máximo uma playlist com o mesmo slug.
create unique index if not exists ux_playlists_user_slug
  on public.playlists (user_id, slug);

-- Evita o mesmo kit duplicado dentro da mesma playlist.
create unique index if not exists ux_playlist_items_playlist_kit
  on public.playlist_items (playlist_id, kit_id);

-- Evita favoritos duplicados por usuário/kit.
create unique index if not exists ux_kit_favorites_user_kit
  on public.kit_favorites (user_id, kit_id);

-- Evita o mesmo usuário ativo/pendente duplicado no mesmo ministério.
create unique index if not exists ux_ministry_members_ministry_user_active_pending
  on public.ministry_members (ministry_id, user_id)
  where user_id is not null and status in ('active', 'pending', 'invited');

-- Evita convites duplicados para o mesmo e-mail no mesmo ministério enquanto ainda estão em aberto/ativos.
create unique index if not exists ux_ministry_members_ministry_email_active_pending
  on public.ministry_members (ministry_id, lower(invited_email))
  where invited_email is not null and status in ('active', 'pending', 'invited');

-- Garante unicidade de tokens de convite ministerial.
create unique index if not exists ux_ministry_members_invite_token
  on public.ministry_members (invite_token)
  where invite_token is not null;

-- Garante que um evento Stripe não seja registrado duas vezes na tabela de billing_events.
-- Requer a tabela billing_events existente.
create unique index if not exists ux_billing_events_provider_payload_id
  on public.billing_events (provider, ((payload ->> 'id')))
  where payload ? 'id';

-- Garante que um evento de webhook processado não entre duplicado.
-- Requer a tabela webhook_processed_events existente.
create unique index if not exists ux_webhook_processed_events_provider_event_id
  on public.webhook_processed_events (provider, event_id);
