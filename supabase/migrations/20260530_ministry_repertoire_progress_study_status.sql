-- Adds richer study status for ministry repertoire progress.

alter table public.ministry_repertoire_progress
add column if not exists study_status text;

alter table public.ministry_repertoire_progress
drop constraint if exists ministry_repertoire_progress_study_status_check;

alter table public.ministry_repertoire_progress
add constraint ministry_repertoire_progress_study_status_check
check (
  study_status is null
  or study_status in ('not_studied','studied','doubt','review')
);

update public.ministry_repertoire_progress
set study_status = case
  when studied is true then 'studied'
  else coalesce(study_status, 'not_studied')
end
where study_status is null;

alter table public.ministry_repertoire_progress
alter column study_status set default 'not_studied';

create index if not exists idx_ministry_repertoire_progress_study_status
on public.ministry_repertoire_progress(study_status);

notify pgrst, 'reload schema';
