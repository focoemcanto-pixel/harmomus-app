-- Safe additive hardening for the marketing campaign queue and event tracking.
-- Keeps production compatible while allowing jobs to leave the queue with
-- pending -> processing -> sent/failed and tracking open/click/conversion.

alter table if exists public.communication_logs
  add column if not exists job_id uuid references public.communication_queue(id) on delete set null,
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists status text,
  add column if not exists event_type text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists response jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists communication_logs_job_id_created_at_idx
  on public.communication_logs (job_id, created_at desc);

create index if not exists communication_logs_status_created_at_idx
  on public.communication_logs (status, created_at desc);

alter table if exists public.communication_queue
  add column if not exists processed_at timestamptz,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists response jsonb;

create index if not exists communication_queue_queue_status_idx
  on public.communication_queue (status, scheduled_at nulls first, created_at)
  where status in ('pending', 'processing');

alter table if exists public.marketing_events
  add column if not exists action text,
  add column if not exists source text not null default 'harmomus',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.marketing_events
set action = coalesce(action, event_type)
where action is null;

alter table if exists public.marketing_events
  drop constraint if exists marketing_events_event_type_check;

create index if not exists marketing_events_action_created_at_idx
  on public.marketing_events (action, created_at desc);

create index if not exists marketing_events_open_click_conversion_idx
  on public.marketing_events (event_type, created_at desc)
  where event_type in ('open', 'click', 'conversion');
