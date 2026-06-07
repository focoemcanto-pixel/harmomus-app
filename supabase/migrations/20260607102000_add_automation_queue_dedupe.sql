-- Extra anti-duplication safeguards for behavior automations.
-- Prevents multiple pending/processing jobs for the same user + automation + channel.

create unique index if not exists communication_queue_unique_pending_automation_user_idx
  on public.communication_queue (
    user_id,
    channel,
    ((payload ->> 'automation_id'))
  )
  where user_id is not null
    and (payload ->> 'automation_id') is not null
    and status in ('pending', 'processing', 'queued');

create index if not exists communication_queue_automation_recent_idx
  on public.communication_queue (
    user_id,
    channel,
    ((payload ->> 'automation_id')),
    created_at desc
  )
  where user_id is not null
    and (payload ->> 'automation_id') is not null;
