-- Make checkout-abandonment automations react to the real abandonment event emitted by payment webhooks.

update public.marketing_automations
set
  trigger_event = 'checkout_abandoned',
  audience_rule = coalesce(audience_rule, '{}'::jsonb) || '{"exclude_events":["checkout_completed","checkout.session.completed","subscription_created","subscription.created","payment_succeeded","payment.approved","plan.plus_activated","plan.premium_activated"],"window_hours":24}'::jsonb,
  updated_at = now()
where intent = 'checkout_abandoned'
  and trigger_event <> 'checkout_abandoned';
