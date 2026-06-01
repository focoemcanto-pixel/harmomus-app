-- Safe additive migration for Admin Communication / Marketing Center.
-- This migration intentionally avoids destructive changes.

create extension if not exists pgcrypto;

-- 1) Communication logs: some existing environments have the table without status/details.
alter table if exists public.communication_logs
  add column if not exists status text not null default 'queued',
  add column if not exists channel text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists communication_logs_status_created_at_idx
  on public.communication_logs (status, created_at desc);

create index if not exists communication_logs_channel_created_at_idx
  on public.communication_logs (channel, created_at desc);

create index if not exists communication_logs_campaign_id_created_at_idx
  on public.communication_logs (campaign_id, created_at desc);

-- 2) Subscription cancellation timestamp used by revenue/churn dashboards.
alter table if exists public.subscriptions
  add column if not exists canceled_at timestamptz;

create index if not exists subscriptions_canceled_at_idx
  on public.subscriptions (canceled_at desc)
  where canceled_at is not null;

-- 3) Marketing events: lightweight event stream used for open/click/conversion metrics.
create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  event_type text not null,
  channel text,
  source text not null default 'harmomus',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.marketing_events
  add column if not exists event_type text,
  add column if not exists channel text,
  add column if not exists source text not null default 'harmomus',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists marketing_events_event_type_created_at_idx
  on public.marketing_events (event_type, created_at desc);

create index if not exists marketing_events_campaign_id_created_at_idx
  on public.marketing_events (campaign_id, created_at desc);

create index if not exists marketing_events_user_id_created_at_idx
  on public.marketing_events (user_id, created_at desc);

alter table public.marketing_events enable row level security;

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

-- 4) Marketing logs: compatibility table for older/newer dashboard reads.
create table if not exists public.marketing_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  channel text,
  status text not null default 'queued',
  event_type text,
  provider text,
  provider_message_id text,
  recipient text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketing_logs_status_created_at_idx
  on public.marketing_logs (status, created_at desc);

create index if not exists marketing_logs_channel_created_at_idx
  on public.marketing_logs (channel, created_at desc);

create index if not exists marketing_logs_campaign_id_created_at_idx
  on public.marketing_logs (campaign_id, created_at desc);

alter table public.marketing_logs enable row level security;

drop policy if exists "Admins can manage marketing logs" on public.marketing_logs;
create policy "Admins can manage marketing logs"
  on public.marketing_logs
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

-- 5) Subscription history fallback in case the previous migration has not been applied in production.
create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  from_plan_id uuid references public.plans(id) on delete set null,
  to_plan_id uuid references public.plans(id) on delete set null,
  from_plan_slug text,
  to_plan_slug text,
  change_type text not null check (change_type in ('upgrade', 'downgrade', 'change', 'created', 'canceled', 'renewed', 'payment_failed')),
  source text not null default 'system',
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_history_user_id_created_at_idx
  on public.subscription_history (user_id, created_at desc);

create index if not exists subscription_history_subscription_id_created_at_idx
  on public.subscription_history (subscription_id, created_at desc);

create index if not exists subscription_history_change_type_created_at_idx
  on public.subscription_history (change_type, created_at desc);

create unique index if not exists subscription_history_provider_event_unique_idx
  on public.subscription_history (provider_event_id)
  where provider_event_id is not null;

alter table public.subscription_history enable row level security;

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
