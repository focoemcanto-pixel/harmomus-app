create table if not exists public.admin_settings (
  key text primary key,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings_service_role_all" on public.admin_settings;
create policy "admin_settings_service_role_all"
  on public.admin_settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_admin_settings_updated_at on public.admin_settings;
create trigger set_admin_settings_updated_at
before update on public.admin_settings
for each row
execute function public.set_updated_at();
