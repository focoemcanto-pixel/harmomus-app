-- Align production schema with the current admin queries.
-- Safe additive migration for existing installations.

alter table if exists public.subscriptions
  add column if not exists canceled_at timestamptz;

-- Backfill canceled_at from updated_at for already canceled rows only when no explicit timestamp exists.
update public.subscriptions
set canceled_at = coalesce(canceled_at, updated_at, current_period_end, created_at)
where lower(coalesce(status, '')) in ('canceled', 'cancelled')
  and canceled_at is null;

alter table if exists public.communication_logs
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists subscriptions_canceled_at_idx
  on public.subscriptions (canceled_at desc)
  where canceled_at is not null;

create index if not exists communication_logs_user_id_created_at_idx
  on public.communication_logs (user_id, created_at desc)
  where user_id is not null;
