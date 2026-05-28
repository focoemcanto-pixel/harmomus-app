create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  legacy_pms_member_id text,
  migrated_from_pms boolean not null default false,
  migration_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  legacy_pms_plan_id text,
  description text,
  price_cents integer not null default 0,
  currency text not null default 'BRL',
  trial_days integer not null default 0,
  hierarchy_level integer not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  features jsonb not null default '[]'::jsonb,
  stripe_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  legacy_pms_subscription_id text,
  status text not null default 'pending' check (status in ('active', 'trialing', 'overdue', 'canceled', 'expired', 'pending')),
  starts_at timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  auto_renew boolean not null default true,
  gateway text not null default 'stripe',
  gateway_customer_id text,
  gateway_subscription_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  next_billing_at timestamptz,
  canceled_at timestamptz,
  last_webhook_event text,
  migrated_from_pms boolean not null default false,
  original_gateway text,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.migration_logs (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null check (status in ('importado', 'conflito', 'invalido', 'sincronizado', 'erro')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_subscriptions_unique_stripe_subscription_id
  on public.subscriptions(stripe_subscription_id)
  where stripe_subscription_id is not null;

create unique index if not exists idx_subscriptions_unique_gateway_subscription_id
  on public.subscriptions(gateway_subscription_id)
  where gateway_subscription_id is not null;

insert into public.plans (name, slug, legacy_pms_plan_id, description, price_cents, currency, trial_days, hierarchy_level, status, features)
values
  ('Free', 'free', null, 'Plano gratuito para iniciar no Harmomus Studio.', 0, 'BRL', 0, 0, 'active', '["biblioteca_basica"]'::jsonb),
  ('Plus', 'plus', null, 'Plano intermediário com recursos avançados.', 1990, 'BRL', 0, 1, 'active', '["biblioteca_plus", "playlists_ilimitadas"]'::jsonb),
  ('Premium', 'premium', null, 'Plano completo com experiência premium.', 3900, 'BRL', 7, 2, 'active', '["biblioteca_total", "suporte_prioritario", "early_access"]'::jsonb)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  trial_days = excluded.trial_days,
  hierarchy_level = excluded.hierarchy_level,
  status = excluded.status,
  features = excluded.features,
  updated_at = now();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  artist text not null,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  lyrics text,
  cover_url text,
  r2_folder text,
  required_plan uuid references public.plans(id) on delete set null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kit_audio_files (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits(id) on delete cascade,
  tone text not null,
  name text not null,
  r2_key text not null,
  public_url text not null,
  file_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  user_id uuid references public.profiles(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  kit_id uuid not null references public.kits(id) on delete cascade,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (playlist_id, kit_id)
);

create table if not exists public.kit_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kit_id uuid not null references public.kits(id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create table if not exists public.audio_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kit_id uuid not null references public.kits(id) on delete cascade,
  audio_file_id uuid not null references public.kit_audio_files(id) on delete cascade,
  status text not null check (status in ('allowed', 'denied')),
  reason text not null,
  accessed_at timestamptz not null default now()
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.migration_logs (
  id uuid primary key default gen_random_uuid(),
  migration_name text not null,
  source text not null default 'legacy_pms',
  status text not null check (status in ('pending', 'running', 'success', 'error')),
  details text,
  payload jsonb,
  executed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_user_status on public.subscriptions(user_id, status);
create index if not exists idx_kits_category_published on public.kits(category_id, published);
create index if not exists idx_kit_audio_files_kit_tone on public.kit_audio_files(kit_id, tone);
create index if not exists idx_playlists_slug_public on public.playlists(slug, is_public);
create index if not exists idx_playlist_items_playlist_position on public.playlist_items(playlist_id, position);
create index if not exists idx_kit_access_logs_user_accessed_at on public.kit_access_logs(user_id, accessed_at desc);
create index if not exists idx_kit_access_logs_user_kit_accessed_at on public.kit_access_logs(user_id, kit_id, accessed_at desc);
create index if not exists idx_audio_access_logs_accessed_at on public.audio_access_logs(accessed_at desc);
create index if not exists idx_audio_access_logs_user_accessed_at on public.audio_access_logs(user_id, accessed_at desc);
create index if not exists idx_billing_events_provider_created_at on public.billing_events(provider, created_at desc);
create index if not exists idx_migration_logs_name_executed_at on public.migration_logs(migration_name, executed_at desc);

create table if not exists public.home_banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text not null,
  mobile_image_url text,
  button_label text,
  button_href text,
  type text not null default 'campanha',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_home_banners_active_order on public.home_banners(is_active, sort_order);

alter table public.home_banners enable row level security;

drop policy if exists "Public can read active home banners" on public.home_banners;
create policy "Public can read active home banners" on public.home_banners
for select
using (is_active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));

drop policy if exists "Admins can manage home banners" on public.home_banners;
create policy "Admins can manage home banners" on public.home_banners
for all
using (coalesce((select role::text from public.profiles where id = auth.uid()), '') = 'admin')
with check (coalesce((select role::text from public.profiles where id = auth.uid()), '') = 'admin');


create table if not exists public.home_sections (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  subtitle text,
  image_url text,
  button_text text,
  button_link text,
  active boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_home_sections_active_order on public.home_sections(active, order_index);

alter table public.home_sections enable row level security;

drop policy if exists "Public can read active home sections" on public.home_sections;
create policy "Public can read active home sections" on public.home_sections
for select
using (active = true);

drop policy if exists "Admins can manage home sections" on public.home_sections;
create policy "Admins can manage home sections" on public.home_sections
for all
using (coalesce((select role::text from public.profiles where id = auth.uid()), '') = 'admin')
with check (coalesce((select role::text from public.profiles where id = auth.uid()), '') = 'admin');

insert into public.home_sections (type, title, subtitle, button_text, button_link, active, order_index)
values (
  'curso complementar',
  'Foco em Harmonia',
  'Aprenda divisão vocal na prática e desenvolva segurança para cantar em equipe no ministério de louvor.',
  'Conhecer o curso',
  'https://harmonia.focoemcanto.com',
  true,
  1
)
on conflict do nothing;

create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  plan_type text not null check (plan_type in ('ministry_10', 'ministry_20', 'ministry_40')),
  seat_limit integer not null check (seat_limit in (10,20,40)),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'pending' check (status in ('pending','active','trialing','canceled','expired','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_members (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','manager','member')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  status text not null default 'active' check (status in ('invited','active','removed')),
  unique(ministry_id, user_id)
);

create table if not exists public.ministry_invites (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','member')),
  token text not null unique,
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','accepted','expired','canceled'))
);

create table if not exists public.ministry_activity_logs (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  action text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;
alter table public.ministry_invites enable row level security;
alter table public.ministry_activity_logs enable row level security;

drop policy if exists "Users can read own ministry" on public.ministries;
create policy "Users can read own ministry" on public.ministries for select using (
  owner_user_id = auth.uid() or exists (select 1 from public.ministry_members mm where mm.ministry_id = ministries.id and mm.user_id = auth.uid() and mm.status='active')
);

drop policy if exists "Owners manage ministries" on public.ministries;
create policy "Owners manage ministries" on public.ministries for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "Read ministry members" on public.ministry_members;
create policy "Read ministry members" on public.ministry_members for select using (
  exists (select 1 from public.ministry_members mm where mm.ministry_id = ministry_members.ministry_id and mm.user_id = auth.uid() and mm.status='active')
);

drop policy if exists "Owners and managers manage members" on public.ministry_members;
create policy "Owners and managers manage members" on public.ministry_members for all using (
  exists (select 1 from public.ministry_members mm where mm.ministry_id = ministry_members.ministry_id and mm.user_id = auth.uid() and mm.role in ('owner','manager') and mm.status='active')
) with check (
  exists (select 1 from public.ministry_members mm where mm.ministry_id = ministry_members.ministry_id and mm.user_id = auth.uid() and mm.role in ('owner','manager') and mm.status='active')
);
