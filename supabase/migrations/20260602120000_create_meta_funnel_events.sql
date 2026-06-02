create table if not exists public.meta_funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references public.profiles(id) on delete set null,
  anonymous_id text,
  event_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbclid text,
  gclid text,
  event_source_url text,
  user_agent text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists meta_funnel_events_event_id_idx
on public.meta_funnel_events (event_name, event_id)
where event_id is not null;

create index if not exists meta_funnel_events_event_campaign_idx
on public.meta_funnel_events (event_name, utm_campaign, created_at desc);

create index if not exists meta_funnel_events_created_at_idx
on public.meta_funnel_events (created_at desc);

alter table public.meta_funnel_events enable row level security;

drop policy if exists "meta_funnel_events_service_role_all" on public.meta_funnel_events;
create policy "meta_funnel_events_service_role_all"
on public.meta_funnel_events
for all
to service_role
using (true)
with check (true);
