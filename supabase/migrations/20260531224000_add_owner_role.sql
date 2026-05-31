-- Adds a first-class owner role so internal/admin usage can be excluded from SaaS metrics.
-- This keeps admin access working for both owner and admin profiles.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('owner', 'admin', 'member'));

update public.profiles
set role = 'owner', updated_at = now()
where lower(email) = 'amrkuezemarquinhos@hotmail.com';
