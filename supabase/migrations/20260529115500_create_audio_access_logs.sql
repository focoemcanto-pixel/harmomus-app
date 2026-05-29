create table if not exists public.audio_access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kit_id uuid not null references public.kits(id) on delete cascade,
  audio_file_id uuid not null references public.kit_audio_files(id) on delete cascade,
  status text not null check (status in ('allowed', 'denied')),
  reason text not null default 'ok',
  session_id text,
  device_type text,
  plan_slug text,
  page_path text,
  accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.audio_access_logs
add column if not exists session_id text;

alter table public.audio_access_logs
add column if not exists device_type text;

alter table public.audio_access_logs
add column if not exists plan_slug text;

alter table public.audio_access_logs
add column if not exists page_path text;

alter table public.audio_access_logs
add column if not exists created_at timestamptz not null default now();

alter table public.audio_access_logs
alter column reason set default 'ok';

create index if not exists idx_audio_access_logs_accessed_at
on public.audio_access_logs(accessed_at desc);

create index if not exists idx_audio_access_logs_user_accessed_at
on public.audio_access_logs(user_id, accessed_at desc);

create index if not exists idx_audio_access_logs_kit_accessed_at
on public.audio_access_logs(kit_id, accessed_at desc);

create index if not exists idx_audio_access_logs_file_accessed_at
on public.audio_access_logs(audio_file_id, accessed_at desc);

create index if not exists idx_audio_access_logs_status_accessed_at
on public.audio_access_logs(status, accessed_at desc);

create index if not exists idx_audio_access_logs_plan_status_accessed_at
on public.audio_access_logs(plan_slug, status, accessed_at desc);

create index if not exists idx_audio_access_logs_device_accessed_at
on public.audio_access_logs(device_type, accessed_at desc);

alter table public.audio_access_logs enable row level security;

drop policy if exists "audio_access_logs_service_role_all" on public.audio_access_logs;
create policy "audio_access_logs_service_role_all"
on public.audio_access_logs
for all
to service_role
using (true)
with check (true);
