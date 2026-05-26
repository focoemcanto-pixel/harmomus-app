create table if not exists public.audio_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits(id) on delete cascade,
  source_audio_file_id uuid not null references public.kit_audio_files(id) on delete cascade,
  generated_audio_file_id uuid references public.kit_audio_files(id) on delete set null,
  voice text not null,
  source_tone text not null,
  target_tone text not null,
  semitone_shift integer not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  error_message text,
  source_r2_key text not null,
  target_r2_key text not null,
  output_file_type text not null default 'mp3',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kit_id, voice, target_tone, source_audio_file_id)
);

create index if not exists audio_generation_jobs_status_created_idx on public.audio_generation_jobs(status, created_at);
create index if not exists audio_generation_jobs_kit_idx on public.audio_generation_jobs(kit_id);
create index if not exists audio_generation_jobs_source_audio_idx on public.audio_generation_jobs(source_audio_file_id);

create or replace function public.set_audio_generation_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_audio_generation_jobs_updated_at on public.audio_generation_jobs;
create trigger trg_audio_generation_jobs_updated_at
before update on public.audio_generation_jobs
for each row execute function public.set_audio_generation_jobs_updated_at();
