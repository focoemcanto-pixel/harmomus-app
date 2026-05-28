-- Safe reconciliation for legacy kit_audio_files.source_type values.
--
-- 1) Preview mode (default):
--      psql "$DATABASE_URL" -f scripts/reconcile-kit-audio-source-type.sql
--
-- 2) Apply mode after reviewing the preview:
--      psql "$DATABASE_URL" -v apply=true -f scripts/reconcile-kit-audio-source-type.sql
--
-- Classification rule:
--   generated = kit_audio_files linked to completed audio_generation_jobs by
--               generated_audio_file_id or by the generated target_r2_key.
--   original  = files not produced by audio_generation_jobs (manual/R2 sync).

\if :{?apply}
\else
  \set apply false
\endif

begin;

select
  kit_slug,
  tone,
  voice,
  r2_key,
  current_source_type,
  suggested_source_type
from public.preview_kit_audio_source_type_reconciliation(array['tudo-e-perda', '1000-graus']::text[]);

\if :apply
  select
    kit_slug,
    tone,
    voice,
    r2_key,
    previous_source_type,
    new_source_type
  from public.reconcile_kit_audio_source_type(array['tudo-e-perda', '1000-graus']::text[]);

  commit;
\else
  rollback;
\endif
