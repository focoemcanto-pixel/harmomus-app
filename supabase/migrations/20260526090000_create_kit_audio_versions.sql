create table if not exists public.kit_audio_versions (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.kits(id) on delete cascade,
  voice text not null,
  tone text not null,
  source_tone text not null,
  is_generated boolean not null default false,
  semitone_shift integer not null default 0,
  audio_url text not null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create index if not exists kit_audio_versions_kit_id_idx on public.kit_audio_versions(kit_id);
create index if not exists kit_audio_versions_lookup_idx on public.kit_audio_versions(kit_id, voice, tone);
