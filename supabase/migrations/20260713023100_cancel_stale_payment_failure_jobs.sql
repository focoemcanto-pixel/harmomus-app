-- Cancel delayed payment-failure messages as soon as the same user recovers or pays.
-- This closes the race where a payment fails, a WhatsApp job is queued for later,
-- and the payment is confirmed before the scheduled send.

begin;

create or replace function public.cancel_stale_payment_failure_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  if new.event_key in (
    'subscription.payment_recovered',
    'subscription.first_payment',
    'subscription.renewed',
    'payment.approved',
    'payment_received',
    'payment_confirmed'
  ) then
    update public.communication_queue
    set
      status = 'canceled',
      error_message = null,
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'canceled_reason', 'payment_recovered_before_send',
        'canceled_by_event_id', new.id,
        'canceled_at', now()
      ),
      updated_at = now()
    where user_id = new.user_id
      and status in ('pending', 'queued')
      and payload->>'trigger_event_key' in (
        'subscription.payment_failed',
        'payment_failed'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_events_cancel_stale_payment_failure_jobs
on public.marketing_events;

create trigger marketing_events_cancel_stale_payment_failure_jobs
after insert on public.marketing_events
for each row execute function public.cancel_stale_payment_failure_jobs();

commit;
