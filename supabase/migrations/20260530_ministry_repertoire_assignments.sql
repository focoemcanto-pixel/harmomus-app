create table if not exists public.ministry_repertoire_assignments (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references public.ministry_repertoires(id) on delete cascade,
  repertoire_item_id uuid not null references public.ministry_repertoire_items(id) on delete cascade,
  kit_id uuid references public.kits(id) on delete cascade,
  member_id uuid not null references public.ministry_members(id) on delete cascade,
  assigned_voice text,
  assigned_tone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ministry_repertoire_assignments
drop constraint if exists ministry_repertoire_assignments_voice_check;

alter table public.ministry_repertoire_assignments
add constraint ministry_repertoire_assignments_voice_check
check (
  assigned_voice is null
  or assigned_voice in ('todos','lead','tenor','contralto','soprano','baritono','baixo')
);

create unique index if not exists ministry_repertoire_assignments_unique_member_item
on public.ministry_repertoire_assignments(repertoire_item_id, member_id);

create index if not exists idx_ministry_repertoire_assignments_repertoire
on public.ministry_repertoire_assignments(repertoire_id);

create index if not exists idx_ministry_repertoire_assignments_member
on public.ministry_repertoire_assignments(member_id);

notify pgrst, 'reload schema';
