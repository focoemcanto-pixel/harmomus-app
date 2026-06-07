-- Conversion journey attribution for behavior-based marketing automations.
-- Tracks a user's path from behavioral trigger -> automation queued/sent -> checkout -> paid conversion.

create extension if not exists pgcrypto;

create table if not exists public.marketing_conversion_journeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  automation_id uuid references public.marketing_automations(id) on delete set null,
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  queue_id uuid references public.communication_queue(id) on delete set null,
  automation_run_id uuid references public.marketing_automation_runs(id) on delete set null,
  first_event_id uuid references public.marketing_events(id) on delete set null,
  first_event_key text,
  dominant_intent text,
  channel text,
  status text not null default 'started',
  score integer not null default 0,
  started_at timestamptz not null default now(),
  queued_at timestamptz,
  sent_at timestamptz,
  clicked_at timestamptz,
  checkout_started_at timestamptz,
  checkout_completed_at timestamptz,
  converted_at timestamptz,
  canceled_at timestamptz,
  conversion_event_id uuid references public.marketing_events(id) on delete set null,
  conversion_source text,
  conversion_plan_slug text,
  conversion_amount_cents integer,
  conversion_currency text default 'brl',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_conversion_journeys_status_check check (status in ('started','queued','sent','clicked','checkout_started','converted','canceled','expired')),
  constraint marketing_conversion_journeys_channel_check check (channel is null or channel in ('whatsapp','email','app'))
);

create index if not exists marketing_conversion_journeys_user_created_at_idx
  on public.marketing_conversion_journeys (user_id, created_at desc);

create index if not exists marketing_conversion_journeys_automation_status_idx
  on public.marketing_conversion_journeys (automation_id, status, created_at desc);

create index if not exists marketing_conversion_journeys_campaign_status_idx
  on public.marketing_conversion_journeys (campaign_id, status, created_at desc);

create index if not exists marketing_conversion_journeys_queue_idx
  on public.marketing_conversion_journeys (queue_id)
  where queue_id is not null;

create index if not exists marketing_conversion_journeys_checkout_started_idx
  on public.marketing_conversion_journeys (checkout_started_at desc)
  where checkout_started_at is not null;

create index if not exists marketing_conversion_journeys_converted_idx
  on public.marketing_conversion_journeys (converted_at desc)
  where converted_at is not null;

-- One open journey per user and dominant intent avoids duplicating attribution windows.
create unique index if not exists marketing_conversion_journeys_open_user_intent_idx
  on public.marketing_conversion_journeys (user_id, dominant_intent)
  where user_id is not null and dominant_intent is not null and status in ('started','queued','sent','clicked','checkout_started');

alter table public.marketing_conversion_journeys enable row level security;

drop policy if exists "Admins can manage marketing conversion journeys" on public.marketing_conversion_journeys;
create policy "Admins can manage marketing conversion journeys"
  on public.marketing_conversion_journeys
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

-- Helper RPC-friendly function for checkout_started events.
create or replace function public.marketing_mark_checkout_started(
  p_user_id uuid,
  p_plan_slug text default null,
  p_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketing_conversion_journeys
  set
    status = case when status = 'converted' then status else 'checkout_started' end,
    checkout_started_at = coalesce(checkout_started_at, now()),
    conversion_plan_slug = coalesce(conversion_plan_slug, p_plan_slug),
    conversion_event_id = coalesce(conversion_event_id, p_event_id),
    updated_at = now()
  where user_id = p_user_id
    and status in ('started','queued','sent','clicked','checkout_started')
    and created_at >= now() - interval '14 days';
end;
$$;

-- Helper RPC-friendly function for completed payments/conversions.
create or replace function public.marketing_mark_conversion_completed(
  p_user_id uuid,
  p_plan_slug text default null,
  p_amount_cents integer default null,
  p_currency text default 'brl',
  p_source text default 'stripe',
  p_event_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.marketing_conversion_journeys
  set
    status = 'converted',
    checkout_completed_at = coalesce(checkout_completed_at, now()),
    converted_at = coalesce(converted_at, now()),
    conversion_plan_slug = coalesce(p_plan_slug, conversion_plan_slug),
    conversion_amount_cents = coalesce(p_amount_cents, conversion_amount_cents),
    conversion_currency = coalesce(p_currency, conversion_currency, 'brl'),
    conversion_source = coalesce(p_source, conversion_source),
    conversion_event_id = coalesce(p_event_id, conversion_event_id),
    updated_at = now()
  where user_id = p_user_id
    and status in ('started','queued','sent','clicked','checkout_started')
    and created_at >= now() - interval '30 days';
end;
$$;