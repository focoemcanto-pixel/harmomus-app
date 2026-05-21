create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_cents integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null default 'trialing' check (status in ('active', 'trialing', 'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_subscriptions_user_status on public.subscriptions(user_id, status);
create index if not exists idx_kits_category_published on public.kits(category_id, published);


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

create index if not exists idx_kit_audio_files_kit_tone on public.kit_audio_files(kit_id, tone);



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

create index if not exists idx_playlists_slug_public on public.playlists(slug, is_public);
create index if not exists idx_playlist_items_playlist_position on public.playlist_items(playlist_id, position);
