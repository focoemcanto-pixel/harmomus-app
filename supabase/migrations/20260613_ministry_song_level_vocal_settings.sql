alter table public.ministry_repertoire_items
  add column if not exists key_override text;

alter table public.ministry_repertoire_items
  add column if not exists notes text;

alter table public.ministry_repertoire_assignments
  add column if not exists song_member_notes text;

create index if not exists ministry_repertoire_assignments_item_member_idx
on public.ministry_repertoire_assignments(repertoire_item_id, member_id);

notify pgrst, 'reload schema';
