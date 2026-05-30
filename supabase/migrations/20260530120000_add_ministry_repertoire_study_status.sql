alter table public.ministry_repertoire_progress
  add column if not exists study_status text not null default 'not_studied';

alter table public.ministry_repertoire_progress
  drop constraint if exists ministry_repertoire_progress_study_status_check;

alter table public.ministry_repertoire_progress
  add constraint ministry_repertoire_progress_study_status_check
  check (study_status in ('not_studied', 'studied', 'doubt', 'review'));

update public.ministry_repertoire_progress
set study_status = case
  when studied = true then 'studied'
  when study_status is null then 'not_studied'
  else study_status
end,
updated_at = now()
where repertoire_item_id is not null
  and (studied = true or study_status is null);

create index if not exists ministry_repertoire_progress_study_status_idx
  on public.ministry_repertoire_progress(repertoire_id, user_id, study_status)
  where repertoire_item_id is not null;
