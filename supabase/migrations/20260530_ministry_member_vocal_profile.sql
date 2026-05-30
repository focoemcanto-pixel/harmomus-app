-- Add optional vocal profile fields to ministry members.

alter table public.ministry_members
  add column if not exists vocal_primary text,
  add column if not exists vocal_secondary text;

alter table public.ministry_members
  drop constraint if exists ministry_members_vocal_primary_check,
  drop constraint if exists ministry_members_vocal_secondary_check;

alter table public.ministry_members
  add constraint ministry_members_vocal_primary_check
    check (vocal_primary is null or vocal_primary in ('lead','tenor','contralto','soprano','baritono','baixo','instrumento','outro')),
  add constraint ministry_members_vocal_secondary_check
    check (vocal_secondary is null or vocal_secondary in ('lead','tenor','contralto','soprano','baritono','baixo','instrumento','outro'));

notify pgrst, 'reload schema';
