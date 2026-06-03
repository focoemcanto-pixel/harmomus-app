-- Harden communication queue personalization and transient provider retries.
-- 1) Never keep an e-mail address as recipient_name.
-- 2) Treat provider HTTP 429 as transient rate-limit: requeue with backoff instead of permanent failure.

create or replace function public.clean_communication_recipient_name(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null or btrim(value) = '' then 'Aluno'
    when position('@' in value) > 0 then 'Aluno'
    when lower(btrim(value)) ~ '^https?://' then 'Aluno'
    else btrim(value)
  end;
$$;

create or replace function public.harden_communication_queue_row()
returns trigger
language plpgsql
as $$
declare
  retry_attempts integer;
  retry_minutes integer;
begin
  new.recipient_name := public.clean_communication_recipient_name(new.recipient_name);

  -- HTTP 429 is a temporary provider rate-limit. Do not keep it as permanent failed.
  if new.status = 'failed'
     and coalesce(new.error_message, new.last_error, '') ilike '%HTTP 429%' then
    retry_attempts := greatest(coalesce(new.attempts, 1), 1);
    retry_minutes := least(60, 15 * retry_attempts);

    new.status := 'pending';
    new.scheduled_at := now() + make_interval(mins => retry_minutes);
    new.scheduled_for := coalesce(new.scheduled_for, new.scheduled_at);
    new.last_error := coalesce(new.error_message, new.last_error);
    new.error_message := null;
    new.processed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_harden_communication_queue_row on public.communication_queue;

create trigger trg_harden_communication_queue_row
before insert or update on public.communication_queue
for each row
execute function public.harden_communication_queue_row();

-- Backfill existing queued contacts that were stored with e-mail as name.
update public.communication_queue
set
  recipient_name = public.clean_communication_recipient_name(recipient_name),
  updated_at = now()
where recipient_name is null
   or btrim(recipient_name) = ''
   or position('@' in recipient_name) > 0
   or lower(btrim(recipient_name)) ~ '^https?://';

-- Requeue existing HTTP 429 failures safely with delayed retry.
update public.communication_queue
set
  status = 'pending',
  scheduled_at = now() + make_interval(mins => least(60, 15 * greatest(coalesce(attempts, 1), 1))),
  scheduled_for = coalesce(scheduled_for, now() + make_interval(mins => least(60, 15 * greatest(coalesce(attempts, 1), 1)))),
  last_error = coalesce(error_message, last_error),
  error_message = null,
  processed_at = null,
  updated_at = now()
where status = 'failed'
  and coalesce(error_message, last_error, '') ilike '%HTTP 429%';
