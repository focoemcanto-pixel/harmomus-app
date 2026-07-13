begin;

-- Canonical completion events that must cancel stale recovery messages.
create or replace function public.cancel_stale_recovery_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    return new;
  end if;

  -- Any successful conversion/payment cancels pending checkout-abandonment jobs.
  if new.event_key in (
    'subscription.trial_started',
    'subscription.first_payment',
    'subscription.renewed',
    'subscription.payment_recovered',
    'upgrade.free_to_plus',
    'upgrade.free_to_premium',
    'upgrade.plus_to_premium',
    'plan.plus_activated',
    'plan.premium_activated',
    'plan.ministry_activated',
    'checkout.completed',
    'checkout.session.completed',
    'payment.approved',
    'payment_confirmed',
    'payment_received'
  ) then
    update public.communication_queue
    set
      status = 'canceled',
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'canceled_reason', 'conversion_completed_before_send',
        'canceled_by_event_id', new.id,
        'canceled_at', now()
      ),
      updated_at = now()
    where user_id = new.user_id
      and status in ('pending', 'queued')
      and payload->>'automation_intent' = 'checkout_abandoned';
  end if;

  -- A recovered or successfully paid charge cancels pending payment-failure jobs.
  if new.event_key in (
    'subscription.payment_recovered',
    'subscription.first_payment',
    'subscription.renewed',
    'payment.approved',
    'payment_confirmed',
    'payment_received'
  ) then
    update public.communication_queue
    set
      status = 'canceled',
      payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object(
        'canceled_reason', 'payment_recovered_before_send',
        'canceled_by_event_id', new.id,
        'canceled_at', now()
      ),
      updated_at = now()
    where user_id = new.user_id
      and status in ('pending', 'queued')
      and payload->>'automation_intent' = 'payment_recovery';
  end if;

  -- Transactional events must not be blocked by a prior marketing cooldown.
  if new.event_key in (
    'subscription.trial_started',
    'subscription.first_payment',
    'subscription.renewed',
    'subscription.payment_recovered',
    'subscription.payment_failed',
    'subscription.canceled',
    'upgrade.free_to_plus',
    'upgrade.free_to_premium',
    'upgrade.plus_to_premium',
    'downgrade.premium_to_plus',
    'downgrade.premium_to_free',
    'downgrade.plus_to_free'
  ) then
    update public.user_marketing_state
    set
      cooldown_until = null,
      updated_at = now()
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_events_cancel_stale_recovery_jobs
on public.marketing_events;

create trigger marketing_events_cancel_stale_recovery_jobs
after insert on public.marketing_events
for each row
execute function public.cancel_stale_recovery_jobs();

-- Mark canonical transactional automations explicitly for the application layer.
update public.marketing_automations
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'transactional', true,
  'bypass_global_cooldown', true,
  'bypass_daily_limit', true,
  'exclusive_cycle', true
),
updated_at = now()
where trigger_event in (
  'subscription.trial_started',
  'subscription.first_payment',
  'subscription.renewed',
  'subscription.payment_recovered',
  'subscription.payment_failed',
  'subscription.canceled',
  'upgrade.free_to_plus',
  'upgrade.free_to_premium',
  'upgrade.plus_to_premium',
  'downgrade.premium_to_plus',
  'downgrade.premium_to_free',
  'downgrade.plus_to_free'
);

commit;
