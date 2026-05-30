create table if not exists public.ministry_repertoires (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  name text not null,
  description text,
  event_date date,
  created_by uuid references public.profiles(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_repertoire_items (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references public.ministry_repertoires(id) on delete cascade,
  kit_id uuid not null references public.kits(id) on delete cascade,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  unique(repertoire_id, kit_id)
);

create index if not exists ministry_repertoires_ministry_id_idx on public.ministry_repertoires(ministry_id);
create index if not exists ministry_repertoires_archived_idx on public.ministry_repertoires(archived);
create index if not exists ministry_repertoire_items_repertoire_id_idx on public.ministry_repertoire_items(repertoire_id);
create index if not exists ministry_repertoire_items_kit_id_idx on public.ministry_repertoire_items(kit_id);

alter table public.ministry_repertoires enable row level security;
alter table public.ministry_repertoire_items enable row level security;

drop policy if exists "Read own ministry repertoires" on public.ministry_repertoires;
create policy "Read own ministry repertoires" on public.ministry_repertoires for select using (
  exists (
    select 1
    from public.ministry_members mm
    where mm.ministry_id = ministry_repertoires.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
);

drop policy if exists "Managers manage ministry repertoires" on public.ministry_repertoires;
create policy "Managers manage ministry repertoires" on public.ministry_repertoires for all using (
  exists (
    select 1
    from public.ministry_members mm
    where mm.ministry_id = ministry_repertoires.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','manager')
  )
) with check (
  exists (
    select 1
    from public.ministry_members mm
    where mm.ministry_id = ministry_repertoires.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','manager')
  )
);

drop policy if exists "Read own ministry repertoire items" on public.ministry_repertoire_items;
create policy "Read own ministry repertoire items" on public.ministry_repertoire_items for select using (
  exists (
    select 1
    from public.ministry_repertoires mr
    join public.ministry_members mm on mm.ministry_id = mr.ministry_id
    where mr.id = ministry_repertoire_items.repertoire_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
);

drop policy if exists "Managers manage ministry repertoire items" on public.ministry_repertoire_items;
create policy "Managers manage ministry repertoire items" on public.ministry_repertoire_items for all using (
  exists (
    select 1
    from public.ministry_repertoires mr
    join public.ministry_members mm on mm.ministry_id = mr.ministry_id
    where mr.id = ministry_repertoire_items.repertoire_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','manager')
  )
) with check (
  exists (
    select 1
    from public.ministry_repertoires mr
    join public.ministry_members mm on mm.ministry_id = mr.ministry_id
    where mr.id = ministry_repertoire_items.repertoire_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','manager')
  )
);
