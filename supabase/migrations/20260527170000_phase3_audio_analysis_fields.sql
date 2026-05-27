alter table public.audio_analysis_jobs
  add column if not exists detected_min_note integer,
  add column if not exists detected_max_note integer,
  add column if not exists comfort_min_note integer,
  add column if not exists comfort_max_note integer,
  add column if not exists vocal_confidence numeric,
  add column if not exists pitch_events_json jsonb;

comment on column public.audio_analysis_jobs.detected_min_note is 'Nota MIDI mínima detectada na linha vocal principal (Demucs + Basic Pitch).';
comment on column public.audio_analysis_jobs.detected_max_note is 'Nota MIDI máxima detectada na linha vocal principal (Demucs + Basic Pitch).';
comment on column public.audio_analysis_jobs.comfort_min_note is 'Limite inferior confortável detectado automaticamente.';
comment on column public.audio_analysis_jobs.comfort_max_note is 'Limite superior confortável detectado automaticamente.';
comment on column public.audio_analysis_jobs.vocal_confidence is 'Confiança agregada da análise vocal principal.';
comment on column public.audio_analysis_jobs.pitch_events_json is 'Eventos de pitch (contorno, picos ocasionais e recomendações de tom).';
