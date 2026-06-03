alter table public.communication_queue
add column if not exists user_id uuid references public.profiles(id) on delete set null,
add column if not exists recipient_name text,
add column if not exists recipient_email text,
add column if not exists recipient_phone text,
add column if not exists scheduled_at timestamptz,
add column if not exists scheduled_for timestamptz,
add column if not exists updated_at timestamptz default now(),
add column if not exists provider_message_id text,
add column if not exists error_message text,
add column if not exists last_error text;

update public.communication_queue
set scheduled_at = coalesce(scheduled_at, scheduled_for),
    error_message = coalesce(error_message, last_error),
    updated_at = coalesce(updated_at, created_at, now())
where scheduled_at is null
   or error_message is null
   or updated_at is null;

create index if not exists idx_communication_queue_status_scheduled_at
on public.communication_queue(status, scheduled_at);

create index if not exists idx_communication_queue_campaign_id
on public.communication_queue(campaign_id);

create index if not exists idx_communication_queue_user_id
on public.communication_queue(user_id);
