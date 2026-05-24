create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  plan_type text not null check (plan_type in ('ministry_10','ministry_20','ministry_40')),
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
  status text not null default 'active' check (status in ('invited','active','removed')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique(ministry_id, user_id)
);

create table if not exists public.ministry_invites (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager','member')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','expired','canceled')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ministry_activity_logs (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
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
