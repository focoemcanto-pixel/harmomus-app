alter table profiles add column if not exists email_verified_at timestamptz;
alter table profiles add column if not exists pending_email text;
alter table profiles add column if not exists email_confirmation_code text;
alter table profiles add column if not exists email_confirmation_expires_at timestamptz;
create index if not exists profiles_email_confirmation_code_idx on profiles(email_confirmation_code);
