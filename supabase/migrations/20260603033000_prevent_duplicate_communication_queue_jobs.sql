-- Prevent duplicate campaign queue jobs per recipient.
-- This keeps campaign re-queue operations safe:
-- - if the recipient already has a sent job in the campaign/channel, skip the new insert;
-- - if the recipient already has a pending/paused/processing/failed job, update that existing job instead of creating a duplicate.

create or replace function public.prevent_duplicate_communication_queue_jobs()
returns trigger
language plpgsql
as $$
declare
  existing_job record;
begin
  if new.campaign_id is null or new.recipient_phone is null or new.channel is null then
    return new;
  end if;

  select id, status
    into existing_job
  from public.communication_queue
  where campaign_id = new.campaign_id
    and channel = new.channel
    and recipient_phone = new.recipient_phone
  order by
    case when status = 'sent' then 0 else 1 end,
    created_at asc
  limit 1;

  if existing_job.id is null then
    return new;
  end if;

  -- Never re-queue a recipient who already received this campaign on this channel.
  if existing_job.status = 'sent' then
    return null;
  end if;

  -- Update the existing non-sent job with the latest campaign payload instead of inserting another row.
  update public.communication_queue
  set
    user_id = coalesce(new.user_id, user_id),
    recipient_name = coalesce(nullif(new.recipient_name, ''), recipient_name),
    recipient_email = coalesce(nullif(new.recipient_email, ''), recipient_email),
    provider = coalesce(new.provider, provider),
    payload = coalesce(new.payload, payload),
    scheduled_at = coalesce(new.scheduled_at, scheduled_at),
    scheduled_for = coalesce(new.scheduled_for, scheduled_for),
    status = case
      when status in ('failed', 'canceled', 'cancelled') then 'pending'
      else status
    end,
    error_message = null,
    last_error = null,
    updated_at = now()
  where id = existing_job.id;

  return null;
end;
$$;

drop trigger if exists trg_prevent_duplicate_communication_queue_jobs on public.communication_queue;

create trigger trg_prevent_duplicate_communication_queue_jobs
before insert on public.communication_queue
for each row
execute function public.prevent_duplicate_communication_queue_jobs();

create index if not exists idx_communication_queue_campaign_channel_phone
on public.communication_queue(campaign_id, channel, recipient_phone)
where campaign_id is not null and recipient_phone is not null and channel is not null;
