create extension if not exists pgcrypto;

create table if not exists public.home_polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  eyebrow text not null default 'Enquete Premium',
  title text,
  subtitle text,
  active boolean not null default true,
  allow_guests boolean not null default true,
  order_index integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.home_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.home_polls(id) on delete cascade,
  label text not null,
  artist text,
  description text,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.home_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.home_polls(id) on delete cascade,
  option_id uuid not null references public.home_poll_options(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  visitor_id text,
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now(),
  constraint home_poll_votes_identity_check check (user_id is not null or visitor_id is not null)
);

create unique index if not exists home_poll_votes_poll_user_unique
  on public.home_poll_votes(poll_id, user_id)
  where user_id is not null;

create unique index if not exists home_poll_votes_poll_visitor_unique
  on public.home_poll_votes(poll_id, visitor_id)
  where visitor_id is not null;

create index if not exists home_polls_active_order_idx on public.home_polls(active, order_index, created_at desc);
create index if not exists home_poll_options_poll_order_idx on public.home_poll_options(poll_id, order_index);
create index if not exists home_poll_votes_poll_option_idx on public.home_poll_votes(poll_id, option_id);

alter table public.home_polls enable row level security;
alter table public.home_poll_options enable row level security;
alter table public.home_poll_votes enable row level security;

drop policy if exists "Public can read active home polls" on public.home_polls;
create policy "Public can read active home polls"
  on public.home_polls for select
  using (active = true);

drop policy if exists "Public can read active home poll options" on public.home_poll_options;
create policy "Public can read active home poll options"
  on public.home_poll_options for select
  using (
    exists (
      select 1 from public.home_polls p
      where p.id = home_poll_options.poll_id and p.active = true
    )
  );

drop policy if exists "Public can read active home poll votes" on public.home_poll_votes;
create policy "Public can read active home poll votes"
  on public.home_poll_votes for select
  using (
    exists (
      select 1 from public.home_polls p
      where p.id = home_poll_votes.poll_id and p.active = true
    )
  );

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_home_polls_updated_at on public.home_polls;
create trigger set_home_polls_updated_at
  before update on public.home_polls
  for each row execute function public.set_updated_at();
