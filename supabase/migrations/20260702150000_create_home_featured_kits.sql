create table if not exists public.home_featured_kits (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits(id) on delete cascade,
  order_index integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint home_featured_kits_order_index_check check (order_index between 1 and 5)
);

create unique index if not exists home_featured_kits_kit_id_key
  on public.home_featured_kits(kit_id);

create index if not exists home_featured_kits_active_order_idx
  on public.home_featured_kits(active, order_index);

alter table public.home_featured_kits enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'home_featured_kits'
      and policyname = 'home_featured_kits_public_read_active'
  ) then
    create policy home_featured_kits_public_read_active
      on public.home_featured_kits
      for select
      using (active = true);
  end if;
end $$;
