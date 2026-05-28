create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  name text not null default 'Meu Ministério',
  plan_type text not null check (plan_type in ('ministry_10', 'ministry_20', 'ministry_40')),
  seat_limit integer not null check (seat_limit in (10, 20, 40)),
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_members (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  invited_email text not null,
  invited_name text,
  role text not null default 'member' check (role in ('owner', 'manager', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active', 'removed', 'expired')),
  invite_token text not null default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ministries_owner_id_key on public.ministries(owner_id);
create unique index if not exists ministry_members_invite_token_key on public.ministry_members(invite_token);
create unique index if not exists ministry_members_active_email_key on public.ministry_members(ministry_id, lower(invited_email)) where status in ('pending', 'active');
create unique index if not exists ministry_members_active_user_key on public.ministry_members(ministry_id, user_id) where user_id is not null and status = 'active';
create index if not exists ministry_members_user_status_idx on public.ministry_members(user_id, status);
create index if not exists ministry_members_ministry_status_idx on public.ministry_members(ministry_id, status);

alter table public.ministries enable row level security;
alter table public.ministry_members enable row level security;

create policy if not exists "Ministry owners can read own ministry" on public.ministries
  for select using (auth.uid() = owner_id);

create policy if not exists "Ministry members can read linked ministry" on public.ministries
  for select using (
    exists (
      select 1 from public.ministry_members mm
      where mm.ministry_id = ministries.id
        and mm.user_id = auth.uid()
        and mm.status = 'active'
    )
  );

create policy if not exists "Ministry owners can read members" on public.ministry_members
  for select using (
    exists (
      select 1 from public.ministries m
      where m.id = ministry_members.ministry_id
        and m.owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );
