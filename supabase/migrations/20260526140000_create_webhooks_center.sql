create extension if not exists pgcrypto;

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  url text not null,
  secret text not null,
  environment text not null default 'production',
  active boolean not null default true,
  retry_enabled boolean not null default true,
  retry_attempts integer not null default 3,
  created_by uuid references auth.users(id) on delete set null,
  events jsonb not null default '[]'::jsonb,
  last_triggered_at timestamptz
);

create index if not exists webhook_endpoints_active_idx on public.webhook_endpoints(active);
create index if not exists webhook_endpoints_environment_idx on public.webhook_endpoints(environment);

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  created_at timestamptz not null default now(),
  event text not null,
  delivery_id text not null,
  status integer not null,
  success boolean not null,
  request_headers jsonb not null default '{}'::jsonb,
  request_body jsonb not null default '{}'::jsonb,
  response_body text,
  duration_ms integer not null default 0,
  retry_attempt integer not null default 0,
  error_message text
);

create index if not exists webhook_logs_endpoint_id_idx on public.webhook_logs(endpoint_id);
create index if not exists webhook_logs_success_idx on public.webhook_logs(success);
create index if not exists webhook_logs_created_at_idx on public.webhook_logs(created_at desc);

create or replace function public.set_webhook_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_webhook_endpoints_updated_at on public.webhook_endpoints;
create trigger set_webhook_endpoints_updated_at
before update on public.webhook_endpoints
for each row execute function public.set_webhook_updated_at();
