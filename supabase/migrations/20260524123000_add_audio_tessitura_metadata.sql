alter table public.kit_audio_files
  add column if not exists min_midi_note integer,
  add column if not exists max_midi_note integer,
  add column if not exists detected_min_midi_note integer,
  add column if not exists detected_max_midi_note integer,
  add column if not exists tessitura_confidence numeric(5,4),
  add column if not exists tessitura_source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kit_audio_files_tessitura_source_check'
  ) then
    alter table public.kit_audio_files
      add constraint kit_audio_files_tessitura_source_check
      check (tessitura_source in ('manual', 'auto', 'hybrid'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'kit_audio_files_manual_tessitura_range_check'
  ) then
    alter table public.kit_audio_files
      add constraint kit_audio_files_manual_tessitura_range_check
      check (
        min_midi_note is null
        or max_midi_note is null
        or min_midi_note <= max_midi_note
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'kit_audio_files_detected_tessitura_range_check'
  ) then
    alter table public.kit_audio_files
      add constraint kit_audio_files_detected_tessitura_range_check
      check (
        detected_min_midi_note is null
        or detected_max_midi_note is null
        or detected_min_midi_note <= detected_max_midi_note
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'kit_audio_files_tessitura_confidence_check'
  ) then
    alter table public.kit_audio_files
      add constraint kit_audio_files_tessitura_confidence_check
      check (
        tessitura_confidence is null
        or (tessitura_confidence >= 0 and tessitura_confidence <= 1)
      );
  end if;
end $$;

comment on column public.kit_audio_files.min_midi_note is 'Nota mais grave validada manualmente para análise de tessitura.';
comment on column public.kit_audio_files.max_midi_note is 'Nota mais aguda validada manualmente para análise de tessitura.';
comment on column public.kit_audio_files.detected_min_midi_note is 'Nota mais grave detectada automaticamente pelo analisador.';
comment on column public.kit_audio_files.detected_max_midi_note is 'Nota mais aguda detectada automaticamente pelo analisador.';
comment on column public.kit_audio_files.tessitura_confidence is 'Confiança da detecção automática de tessitura, de 0 a 1.';
comment on column public.kit_audio_files.tessitura_source is 'Origem da tessitura usada: manual, auto ou hybrid.';

create index if not exists idx_kit_audio_files_tessitura
  on public.kit_audio_files(kit_id, tone, min_midi_note, max_midi_note);

create index if not exists idx_kit_audio_files_detected_tessitura
  on public.kit_audio_files(kit_id, tone, detected_min_midi_note, detected_max_midi_note);
