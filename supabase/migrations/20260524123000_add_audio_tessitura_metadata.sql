alter table public.kit_audio_files
  add column if not exists min_midi_note integer,
  add column if not exists max_midi_note integer,
  add column if not exists detected_min_midi_note integer,
  add column if not exists detected_max_midi_note integer,
  add column if not exists tessitura_confidence numeric(5,4),
  add column if not exists tessitura_source text not null default 'manual' check (tessitura_source in ('manual', 'auto', 'hybrid'));

comment on column public.kit_audio_files.min_midi_note is 'Nota mais grave validada para análise de tessitura.';
comment on column public.kit_audio_files.max_midi_note is 'Nota mais aguda validada para análise de tessitura.';
comment on column public.kit_audio_files.detected_min_midi_note is 'Nota mais grave detectada automaticamente pelo analisador.';
comment on column public.kit_audio_files.detected_max_midi_note is 'Nota mais aguda detectada automaticamente pelo analisador.';
comment on column public.kit_audio_files.tessitura_confidence is 'Confiança da detecção automática de tessitura, de 0 a 1.';
comment on column public.kit_audio_files.tessitura_source is 'Origem da tessitura usada: manual, auto ou híbrida.';

create index if not exists idx_kit_audio_files_tessitura
  on public.kit_audio_files(kit_id, tone, min_midi_note, max_midi_note);
