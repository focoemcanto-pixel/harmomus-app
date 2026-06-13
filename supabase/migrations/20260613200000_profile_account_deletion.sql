alter table profiles add column if not exists deletion_requested_at timestamptz;
alter table profiles add column if not exists deletion_scheduled_for timestamptz;
alter table profiles add column if not exists deletion_cancelled_at timestamptz;

create index if not exists profiles_deletion_scheduled_for_idx on profiles(deletion_scheduled_for);
