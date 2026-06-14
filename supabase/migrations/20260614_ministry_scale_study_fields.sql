-- Campos usados pela Central Ministerial para configuração e estudo de escalas.
-- Migration segura: pode rodar mais de uma vez sem quebrar o banco.

alter table public.ministry_repertoire_items
  add column if not exists key_override text,
  add column if not exists notes text;

alter table public.ministry_repertoire_assignments
  add column if not exists notes text,
  add column if not exists study_mode text;

alter table public.ministry_repertoire_progress
  add column if not exists study_status text default 'not_studied',
  add column if not exists ready boolean default false,
  add column if not exists ready_at timestamptz;

alter table public.ministry_repertoire_progress
  drop constraint if exists ministry_repertoire_progress_study_status_check;

alter table public.ministry_repertoire_progress
  add constraint ministry_repertoire_progress_study_status_check
  check (study_status in ('not_studied', 'studied', 'doubt', 'review'));

create index if not exists idx_ministry_repertoire_items_repertoire_id
  on public.ministry_repertoire_items(repertoire_id);

create index if not exists idx_ministry_repertoire_assignments_repertoire_item
  on public.ministry_repertoire_assignments(repertoire_id, repertoire_item_id, member_id);

create index if not exists idx_ministry_repertoire_progress_user_item
  on public.ministry_repertoire_progress(repertoire_id, user_id, repertoire_item_id);
