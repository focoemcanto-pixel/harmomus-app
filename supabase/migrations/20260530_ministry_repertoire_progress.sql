create table if not exists public.ministry_repertoire_progress (
  id uuid primary key default gen_random_uuid(),
  repertoire_id uuid not null references public.ministry_repertoires(id) on delete cascade,
  repertoire_item_id uuid references public.ministry_repertoire_items(id) on delete cascade,
  kit_id uuid references public.kits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  studied boolean not null default false,
  studied_at timestamptz,
  study_status text not null default 'not_studied' check (study_status in ('not_studied', 'studied', 'doubt', 'review')),
  ready boolean not null default false,
  ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ministry_repertoire_progress_study_target_check check (
    repertoire_item_id is not null or ready = true
  ),
  unique(repertoire_id, repertoire_item_id, user_id)
);

create unique index if not exists ministry_repertoire_ready_unique_idx
  on public.ministry_repertoire_progress(repertoire_id, user_id)
  where ready = true and repertoire_item_id is null;

create index if not exists ministry_repertoire_progress_repertoire_id_idx on public.ministry_repertoire_progress(repertoire_id);
create index if not exists ministry_repertoire_progress_user_id_idx on public.ministry_repertoire_progress(user_id);
create index if not exists ministry_repertoire_progress_item_id_idx on public.ministry_repertoire_progress(repertoire_item_id);
create index if not exists ministry_repertoire_progress_study_status_idx on public.ministry_repertoire_progress(repertoire_id, user_id, study_status) where repertoire_item_id is not null;

alter table public.ministry_repertoire_progress enable row level security;

drop policy if exists "Read own ministry repertoire progress" on public.ministry_repertoire_progress;
create policy "Read own ministry repertoire progress" on public.ministry_repertoire_progress for select using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.ministry_repertoires mr
    join public.ministry_members mm on mm.ministry_id = mr.ministry_id
    where mr.id = ministry_repertoire_progress.repertoire_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','manager')
  )
);

drop policy if exists "Members manage own repertoire progress" on public.ministry_repertoire_progress;
create policy "Members manage own repertoire progress" on public.ministry_repertoire_progress for all using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ministry_repertoires mr
    join public.ministry_members mm on mm.ministry_id = mr.ministry_id
    where mr.id = ministry_repertoire_progress.repertoire_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
) with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ministry_repertoires mr
    join public.ministry_members mm on mm.ministry_id = mr.ministry_id
    where mr.id = ministry_repertoire_progress.repertoire_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
);
