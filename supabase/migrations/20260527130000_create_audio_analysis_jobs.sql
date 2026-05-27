create table if not exists public.audio_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits(id) on delete cascade,
  audio_file_id uuid not null references public.kit_audio_files(id) on delete cascade,
  voice text,
  tone text,
  status text not null default 'pending',
  analysis_type text not null default 'tessitura',
  source_r2_key text,
  vocal_stem_r2_key text,
  detected_min_midi integer,
  detected_max_midi integer,
  comfort_min_midi integer,
  comfort_max_midi integer,
  dominant_notes jsonb,
  recommended_tones jsonb,
  analysis_method text,
  analysis_logs jsonb,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audio_analysis_jobs_status_created_idx on public.audio_analysis_jobs(status, created_at);
create index if not exists audio_analysis_jobs_kit_idx on public.audio_analysis_jobs(kit_id);
create index if not exists audio_analysis_jobs_audio_file_idx on public.audio_analysis_jobs(audio_file_id);

create or replace function public.set_audio_analysis_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_audio_analysis_jobs_updated_at on public.audio_analysis_jobs;
create trigger trg_audio_analysis_jobs_updated_at
before update on public.audio_analysis_jobs
for each row execute function public.set_audio_analysis_jobs_updated_at();
