create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_events_provider_event_id_idx
on public.billing_events (provider, (payload->>'id'))
where payload ? 'id';

create index if not exists billing_events_provider_processed_idx
on public.billing_events (provider, processed, created_at desc);

create index if not exists billing_events_event_type_idx
on public.billing_events (event_type, created_at desc);

create or replace function public.set_billing_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.processed = true and old.processed is distinct from true then
    new.processed_at = coalesce(new.processed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_billing_events_updated_at on public.billing_events;
create trigger set_billing_events_updated_at
before update on public.billing_events
for each row
execute function public.set_billing_events_updated_at();

alter table public.billing_events enable row level security;

drop policy if exists "billing_events_service_role_all" on public.billing_events;
create policy "billing_events_service_role_all"
on public.billing_events
for all
to service_role
using (true)
with check (true);
