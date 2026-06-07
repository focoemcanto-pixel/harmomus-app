-- Global switch for the behavior marketing engine.
-- When production_enabled=false, cron/manual production processing must not create/send automation jobs.

create table if not exists public.marketing_engine_settings (
  id boolean primary key default true,
  production_enabled boolean not null default false,
  processing_interval_minutes integer not null default 5,
  max_automation_events_per_run integer not null default 1000,
  max_queue_messages_per_run integer not null default 2,
  daily_message_limit_per_user integer not null default 3,
  last_automation_run_at timestamptz,
  last_queue_run_at timestamptz,
  last_result jsonb not null default '{}'::jsonb,
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_engine_settings_singleton check (id = true),
  constraint marketing_engine_settings_interval_check check (processing_interval_minutes between 1 and 1440),
  constraint marketing_engine_settings_automation_limit_check check (max_automation_events_per_run between 1 and 10000),
  constraint marketing_engine_settings_queue_limit_check check (max_queue_messages_per_run between 1 and 100),
  constraint marketing_engine_settings_daily_limit_check check (daily_message_limit_per_user between 1 and 20)
);

insert into public.marketing_engine_settings (id, production_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.marketing_engine_settings enable row level security;

drop policy if exists "Admins can manage marketing engine settings" on public.marketing_engine_settings;
create policy "Admins can manage marketing engine settings"
  on public.marketing_engine_settings
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