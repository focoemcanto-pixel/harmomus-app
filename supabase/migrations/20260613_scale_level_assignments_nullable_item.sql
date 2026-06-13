alter table public.ministry_repertoire_assignments
  alter column repertoire_item_id drop not null;

create unique index if not exists ministry_repertoire_assignments_unique_member_scale
on public.ministry_repertoire_assignments(repertoire_id, member_id)
where repertoire_item_id is null;

notify pgrst, 'reload schema';
