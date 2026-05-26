alter table public.profiles
  add column if not exists requires_password_setup boolean not null default false,
  add column if not exists password_setup_completed_at timestamptz null;

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_requires_password_setup on public.profiles(requires_password_setup);
