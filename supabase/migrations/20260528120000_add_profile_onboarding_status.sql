alter table public.profiles
add column if not exists onboarding_status text
default 'pending_email_confirmation';

alter table public.profiles
add column if not exists onboarding_step text
default 'signup_started';

create index if not exists idx_profiles_onboarding_status
on public.profiles(onboarding_status);
