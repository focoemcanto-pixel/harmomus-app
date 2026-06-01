-- Safe additive migration for real Marketing Campaign queue.
-- Supports: campaign -> jobs -> logs -> provider/webhook status.

create extension if not exists pgcrypto;

-- 1) Marketing campaigns used by the Communication Center.
create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text,
  message text,
  link_url text,
  channels text[] not null default array['whatsapp']::text[],
  status text not null default 'draft',
  audience_filters jsonb not null default '{}'::jsonb,
  schedule_mode text not null default 'manual',
  scheduled_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communication_campaigns
  add column if not exists title text,
  add column if not exists message text,
  add column if not exists link_url text,
  add column if not exists channels text[] not null default array['whatsapp']::text[],
  add column if not exists status text not null default 'draft',
  add column if not exists audience_filters jsonb not null default '{}'::jsonb,
  add column if not exists schedule_mode text not null default 'manual',
  add column if not exists scheduled_at timestamptz,
  add column if not exists stats jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists communication_campaigns_status_created_at_idx
  on public.communication_campaigns (status, created_at desc);

create index if not exists communication_campaigns_scheduled_at_idx
  on public.communication_campaigns (scheduled_at)
  where scheduled_at is not null;

alter table public.communication_campaigns enable row level security;

drop policy if exists "Admins can manage marketing campaigns" on public.communication_campaigns;
create policy "Admins can manage marketing campaigns"
  on public.communication_campaigns
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

-- 2) Marketing jobs: actual send queue.
create table if not exists public.communication_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.communication_campaigns(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  recipient_name text,
  recipient_email text,
  recipient_phone text,
  channel text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  scheduled_at timestamptz,
  processed_at timestamptz,
  provider text,
  provider_message_id text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communication_queue
  add column if not exists campaign_id uuid references public.communication_campaigns(id) on delete cascade,
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists recipient_phone text,
  add column if not exists channel text,
  add column if not exists status text not null default 'pending',
  add column if not exists attempts integer not null default 0,
  add column if not exists scheduled_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists error_message text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists communication_queue_status_scheduled_at_idx
  on public.communication_queue (status, scheduled_at nulls first, created_at desc);

create index if not exists communication_queue_campaign_id_status_idx
  on public.communication_queue (campaign_id, status);

create index if not exists communication_queue_user_id_created_at_idx
  on public.communication_queue (user_id, created_at desc);

alter table public.communication_queue enable row level security;

drop policy if exists "Admins can manage marketing jobs" on public.communication_queue;
create policy "Admins can manage marketing jobs"
  on public.communication_queue
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

-- 3) Complete communication_logs columns expected by service/UI.
alter table if exists public.communication_logs
  add column if not exists event text,
  add column if not exists level text not null default 'info',
  add column if not exists message text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

create index if not exists communication_logs_event_created_at_idx
  on public.communication_logs (event, created_at desc);

create index if not exists communication_logs_level_created_at_idx
  on public.communication_logs (level, created_at desc);

-- 4) Optional compatibility columns for communication_campaigns if older table is used.
alter table if exists public.communication_campaigns
  add column if not exists segment_slug text,
  add column if not exists audience_type text,
  add column if not exists preview_payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();
