create extension if not exists "pgcrypto";

insert into public.plans (name, slug, description, price_cents, currency, trial_days, hierarchy_level, status, features)
values
  ('Ministério 10', 'ministry_10', 'Plano ministerial para até 10 integrantes.', 39700, 'BRL', 0, 3, 'active', '["premium_coletivo", "10_integrantes", "gestao_ministerial"]'::jsonb),
  ('Ministério 20', 'ministry_20', 'Plano ministerial para até 20 integrantes.', 69700, 'BRL', 0, 3, 'active', '["premium_coletivo", "20_integrantes", "gestao_ministerial"]'::jsonb),
  ('Ministério 40', 'ministry_40', 'Plano ministerial para até 40 integrantes.', 129700, 'BRL', 0, 3, 'active', '["premium_coletivo", "40_integrantes", "gestao_ministerial"]'::jsonb)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    price_cents = excluded.price_cents,
    hierarchy_level = excluded.hierarchy_level,
    status = excluded.status,
    features = excluded.features,
    updated_at = now();

create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  plan_type text not null check (plan_type in ('ministry_10', 'ministry_20', 'ministry_40', 'custom')),
  seat_limit integer not null default 10,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'trialing', 'past_due', 'canceled', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_members (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  status text not null default 'active' check (status in ('active', 'removed', 'pending')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ministry_id, user_id)
);

create table if not exists public.ministry_invites (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('manager', 'member')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'canceled')),
  invited_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
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

create index if not exists idx_ministries_owner on public.ministries(owner_user_id);
create index if not exists idx_ministries_status on public.ministries(status);
create index if not exists idx_ministry_members_user_status on public.ministry_members(user_id, status);
create index if not exists idx_ministry_members_ministry_status on public.ministry_members(ministry_id, status);
create index if not exists idx_ministry_invites_token on public.ministry_invites(token);
create index if not exists idx_ministry_invites_ministry_status on public.ministry_invites(ministry_id, status);
create index if not exists idx_ministry_activity_logs_ministry_created on public.ministry_activity_logs(ministry_id, created_at desc);

alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;
alter table public.ministry_invites enable row level security;
alter table public.ministry_activity_logs enable row level security;

drop policy if exists "Members can read own ministry" on public.ministries;
create policy "Members can read own ministry" on public.ministries
for select using (
  owner_user_id = auth.uid()
  or exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministries.id and mm.user_id = auth.uid() and mm.status = 'active'
  )
);

drop policy if exists "Owners can update ministry" on public.ministries;
create policy "Owners can update ministry" on public.ministries
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "Members can read ministry members" on public.ministry_members;
create policy "Members can read ministry members" on public.ministry_members
for select using (
  user_id = auth.uid()
  or exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_members.ministry_id and mm.user_id = auth.uid() and mm.status = 'active'
  )
);

drop policy if exists "Managers can manage ministry members" on public.ministry_members;
create policy "Managers can manage ministry members" on public.ministry_members
for all using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_members.ministry_id and mm.user_id = auth.uid() and mm.status = 'active' and mm.role in ('owner','manager')
  )
) with check (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_members.ministry_id and mm.user_id = auth.uid() and mm.status = 'active' and mm.role in ('owner','manager')
  )
);

drop policy if exists "Managers can read invites" on public.ministry_invites;
create policy "Managers can read invites" on public.ministry_invites
for select using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_invites.ministry_id and mm.user_id = auth.uid() and mm.status = 'active' and mm.role in ('owner','manager')
  )
);

drop policy if exists "Managers can manage invites" on public.ministry_invites;
create policy "Managers can manage invites" on public.ministry_invites
for all using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_invites.ministry_id and mm.user_id = auth.uid() and mm.status = 'active' and mm.role in ('owner','manager')
  )
) with check (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_invites.ministry_id and mm.user_id = auth.uid() and mm.status = 'active' and mm.role in ('owner','manager')
  )
);

drop policy if exists "Members can read ministry logs" on public.ministry_activity_logs;
create policy "Members can read ministry logs" on public.ministry_activity_logs
for select using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_activity_logs.ministry_id and mm.user_id = auth.uid() and mm.status = 'active'
  )
);
