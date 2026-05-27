create extension if not exists pgcrypto;

create table if not exists public.webhook_processed_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique(provider, event_id)
);

create table if not exists public.webhook_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  event text not null,
  source text,
  mode text not null default 'live',
  recipient jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','skipped')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  last_error text,
  result jsonb
);

create index if not exists webhook_processed_events_provider_event_idx
on public.webhook_processed_events(provider, event_id);

create index if not exists webhook_dispatch_queue_status_schedule_idx
on public.webhook_dispatch_queue(status, scheduled_for);

create index if not exists webhook_dispatch_queue_event_idx
on public.webhook_dispatch_queue(event);

create or replace function public.set_webhook_dispatch_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_webhook_dispatch_queue_updated_at on public.webhook_dispatch_queue;
create trigger set_webhook_dispatch_queue_updated_at
before update on public.webhook_dispatch_queue
for each row execute function public.set_webhook_dispatch_queue_updated_at();
