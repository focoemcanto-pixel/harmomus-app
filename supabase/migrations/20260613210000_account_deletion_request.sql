alter table profiles add column if not exists account_deletion_requested_at timestamptz;
alter table profiles add column if not exists account_deletion_scheduled_for timestamptz;
alter table profiles add column if not exists account_deletion_canceled_at timestamptz;
alter table profiles add column if not exists account_deletion_reason text;

create index if not exists profiles_account_deletion_scheduled_for_idx
on profiles(account_deletion_scheduled_for)
where account_deletion_scheduled_for is not null;
