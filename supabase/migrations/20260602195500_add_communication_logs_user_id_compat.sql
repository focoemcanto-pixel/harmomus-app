-- Compatibility layer for Admin Communication logs.
-- Some deployed routes still reference communication_logs.user_id.
-- This is additive and keeps current payload/response based logging intact.

alter table if exists public.communication_logs
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists communication_logs_user_id_created_at_idx
  on public.communication_logs(user_id, created_at desc);
