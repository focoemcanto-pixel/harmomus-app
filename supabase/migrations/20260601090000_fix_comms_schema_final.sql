create extension if not exists pgcrypto;

create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  job_id uuid,
  channel text,
  status text not null default 'queued',
  event text,
  event_type text,
  level text not null default 'info',
  message text,
  provider text,
  provider_message_id text,
  recipient text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.communication_logs
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists job_id uuid,
  add column if not exists status text,
  add column if not exists event text,
  add column if not exists event_type text,
  add column if not exists level text default 'info',
  add column if not exists message text,
  add column if not exists response jsonb,
  add column if not exists updated_at timestamptz default now();

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.communication_logs') is not null then
    for constraint_name in
      select distinct con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join unnest(con.conkey) as cols(attnum) on true
      join pg_attribute att on att.attrelid = rel.oid and att.attnum = cols.attnum
      where nsp.nspname = 'public'
        and rel.relname = 'communication_logs'
        and con.contype = 'c'
        and att.attname = 'status'
    loop
      execute format('alter table public.communication_logs drop constraint if exists %I', constraint_name);
    end loop;
  end if;
end $$;

alter table if exists public.communication_logs
  alter column status set default 'queued',
  alter column updated_at set default now();

update public.communication_logs
set
  status = coalesce(status, 'queued'),
  level = coalesce(level, 'info'),
  updated_at = coalesce(updated_at, created_at, now())
where status is null
   or level is null
   or updated_at is null;

create index if not exists communication_logs_status_created_at_idx
  on public.communication_logs (status, created_at desc);

create index if not exists communication_logs_campaign_id_created_at_idx
  on public.communication_logs (campaign_id, created_at desc);

create index if not exists communication_logs_job_id_created_at_idx
  on public.communication_logs (job_id, created_at desc);

create index if not exists communication_logs_event_created_at_idx
  on public.communication_logs (event, created_at desc);

create index if not exists communication_logs_level_created_at_idx
  on public.communication_logs (level, created_at desc);

alter table if exists public.subscriptions
  add column if not exists canceled_at timestamptz;

create index if not exists subscriptions_canceled_at_idx
  on public.subscriptions (canceled_at desc)
  where canceled_at is not null;

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  event_type text,
  event_key text,
  event_label text,
  action text,
  channel text,
  source text not null default 'harmomus',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.marketing_events
  add column if not exists event_type text,
  add column if not exists event_key text,
  add column if not exists event_label text,
  add column if not exists action text,
  add column if not exists channel text,
  add column if not exists source text default 'harmomus',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.marketing_events') is not null then
    for constraint_name in
      select distinct con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      join unnest(con.conkey) as cols(attnum) on true
      join pg_attribute att on att.attrelid = rel.oid and att.attnum = cols.attnum
      where nsp.nspname = 'public'
        and rel.relname = 'marketing_events'
        and con.contype = 'c'
        and att.attname = 'event_type'
    loop
      execute format('alter table public.marketing_events drop constraint if exists %I', constraint_name);
    end loop;
  end if;
end $$;

alter table if exists public.marketing_events
  alter column event_type drop not null,
  alter column source set default 'harmomus',
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default now();

update public.marketing_events
set
  event_type = coalesce(event_type, event_key, action),
  action = coalesce(action, event_type, event_key),
  source = coalesce(nullif(source, ''), 'harmomus'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where event_type is null
   or action is null
   or source is null
   or source = ''
   or metadata is null
   or created_at is null;

create index if not exists marketing_events_event_type_created_at_idx
  on public.marketing_events (event_type, created_at desc);

create index if not exists marketing_events_action_created_at_idx
  on public.marketing_events (action, created_at desc);

create index if not exists marketing_events_campaign_id_created_at_idx
  on public.marketing_events (campaign_id, created_at desc);

create index if not exists marketing_events_user_id_created_at_idx
  on public.marketing_events (user_id, created_at desc);

create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  from_plan_id uuid references public.plans(id) on delete set null,
  to_plan_id uuid references public.plans(id) on delete set null,
  from_plan_slug text,
  to_plan_slug text,
  change_type text not null,
  source text not null default 'system',
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.subscription_history
  add column if not exists user_id uuid references public.profiles(id) on delete cascade,
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists from_plan_id uuid references public.plans(id) on delete set null,
  add column if not exists to_plan_id uuid references public.plans(id) on delete set null,
  add column if not exists from_plan_slug text,
  add column if not exists to_plan_slug text,
  add column if not exists change_type text,
  add column if not exists source text default 'system',
  add column if not exists provider_event_id text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table if exists public.subscription_history
  alter column source set default 'system',
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default now();

update public.subscription_history
set
  source = coalesce(nullif(source, ''), 'system'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now())
where source is null
   or source = ''
   or metadata is null
   or created_at is null;

create index if not exists subscription_history_user_id_created_at_idx
  on public.subscription_history (user_id, created_at desc);

create index if not exists subscription_history_subscription_id_created_at_idx
  on public.subscription_history (subscription_id, created_at desc);

create index if not exists subscription_history_change_type_created_at_idx
  on public.subscription_history (change_type, created_at desc);

create unique index if not exists subscription_history_provider_event_unique_idx
  on public.subscription_history (provider_event_id)
  where provider_event_id is not null;

alter table if exists public.communication_logs enable row level security;
alter table if exists public.marketing_events enable row level security;
alter table if exists public.subscription_history enable row level security;

drop policy if exists "Admins can manage marketing logs" on public.communication_logs;
drop policy if exists "Admins can manage communication logs" on public.communication_logs;
create policy "Admins can manage communication logs"
  on public.communication_logs
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

drop policy if exists "Admins can manage marketing events" on public.marketing_events;
create policy "Admins can manage marketing events"
  on public.marketing_events
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

drop policy if exists "Admins can manage subscription history" on public.subscription_history;
create policy "Admins can manage subscription history"
  on public.subscription_history
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

drop policy if exists "Users can read own subscription history" on public.subscription_history;
create policy "Users can read own subscription history"
  on public.subscription_history
  for select
  using (user_id = auth.uid());
