alter table public.audio_generation_jobs
  add column if not exists processing_method text,
  add column if not exists processing_ms integer,
  add column if not exists processing_logs text;

comment on column public.audio_generation_jobs.processing_method is 'Método de modulação utilizado (rubberband-cli, ffmpeg-rubberband, ffmpeg-asetrate).';
comment on column public.audio_generation_jobs.processing_ms is 'Tempo em ms da etapa de modulação/pitch shift.';
comment on column public.audio_generation_jobs.processing_logs is 'Log textual resumido das etapas do pipeline de áudio.';
