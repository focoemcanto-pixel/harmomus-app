-- Remove the first experimental underscore-based triggers so only canonical dotted events remain.

drop trigger if exists subscriptions_emit_trial_started_event on public.subscriptions;
drop trigger if exists billing_invoices_emit_paid_event on public.billing_invoices;
drop function if exists public.emit_subscription_trial_started_event();
drop function if exists public.emit_paid_invoice_automation_event();

-- Archive obsolete message definitions. They are never deleted, preserving audit/history.
update public.marketing_automations
set status = 'archived',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('legacy_replaced_by_canonical', true),
    updated_at = now()
where trigger_event in (
  'subscription_trial_started',
  'subscription_first_payment',
  'subscription_renewed'
);

-- If migrations were replayed, keep one editable definition per canonical trigger and archive extras.
with ranked as (
  select id,
         row_number() over (
           partition by trigger_event
           order by case when coalesce(metadata->>'canonical','false') = 'true' then 0 else 1 end,
                    created_at desc,
                    id
         ) as position
  from public.marketing_automations
  where trigger_event in (
    'subscription.trial_started',
    'subscription.first_payment',
    'subscription.renewed',
    'subscription.payment_recovered',
    'subscription.payment_failed',
    'subscription.canceled',
    'plan.plus_activated',
    'plan.premium_activated',
    'plan.ministry_activated',
    'upgrade.free_to_plus',
    'upgrade.free_to_premium',
    'upgrade.plus_to_premium',
    'downgrade.premium_to_plus',
    'downgrade.premium_to_free',
    'downgrade.plus_to_free'
  )
)
update public.marketing_automations ma
set status = 'archived',
    metadata = coalesce(ma.metadata, '{}'::jsonb) || jsonb_build_object('duplicate_definition_archived', true),
    updated_at = now()
from ranked r
where ma.id = r.id and r.position > 1;

create unique index if not exists marketing_automations_unique_non_archived_trigger_idx
  on public.marketing_automations (trigger_event)
  where status <> 'archived';
