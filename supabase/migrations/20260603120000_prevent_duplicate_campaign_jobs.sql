-- Definitive idempotency guard for communication campaign recipients.
-- A campaign recipient is unique by campaign_id + channel + recipient_phone.

create or replace function public.prevent_duplicate_communication_queue_jobs()
returns trigger
language plpgsql
as $$
declare
  existing_job record;
begin
  if new.campaign_id is null or new.channel is null or new.recipient_phone is null then
    return new;
  end if;

  select id, status
    into existing_job
  from public.communication_queue
  where campaign_id = new.campaign_id
    and channel = new.channel
    and recipient_phone = new.recipient_phone
    and status in ('sent', 'pending', 'processing', 'paused', 'queued', 'failed')
  order by
    case
      when status = 'sent' then 0
      when status in ('pending', 'processing', 'paused', 'queued') then 1
      when status = 'failed' then 2
      else 3
    end,
    created_at asc
  limit 1;

  if existing_job.id is null then
    return new;
  end if;

  if existing_job.status = 'sent' then
    return null;
  end if;

  if existing_job.status in ('pending', 'processing', 'paused', 'queued') then
    update public.communication_queue
    set
      user_id = new.user_id,
      recipient_name = new.recipient_name,
      recipient_email = new.recipient_email,
      payload = coalesce(new.payload, '{}'::jsonb),
      scheduled_at = new.scheduled_at,
      updated_at = now()
    where id = existing_job.id;

    return null;
  end if;

  if existing_job.status = 'failed' then
    update public.communication_queue
    set
      user_id = new.user_id,
      recipient_name = new.recipient_name,
      recipient_email = new.recipient_email,
      payload = coalesce(new.payload, '{}'::jsonb),
      scheduled_at = new.scheduled_at,
      status = 'pending',
      error_message = null,
      updated_at = now()
    where id = existing_job.id;

    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_communication_queue_jobs on public.communication_queue;

create trigger trg_prevent_duplicate_communication_queue_jobs
before insert on public.communication_queue
for each row
execute function public.prevent_duplicate_communication_queue_jobs();

create index if not exists idx_communication_queue_campaign_channel_phone
on public.communication_queue(campaign_id, channel, recipient_phone)
where campaign_id is not null
  and channel is not null
  and recipient_phone is not null;
