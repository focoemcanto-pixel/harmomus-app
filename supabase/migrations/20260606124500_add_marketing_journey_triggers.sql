-- Automatic triggers for marketing conversion journeys.
-- This makes attribution resilient even when new app code paths create events/runs.

create or replace function public.marketing_sync_journey_from_automation_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'queued' then
    return new;
  end if;

  insert into public.marketing_conversion_journeys (
    user_id,
    automation_id,
    campaign_id,
    queue_id,
    automation_run_id,
    first_event_id,
    first_event_key,
    dominant_intent,
    channel,
    status,
    score,
    started_at,
    queued_at,
    metadata,
    created_at,
    updated_at
  )
  values (
    new.user_id,
    new.automation_id,
    new.campaign_id,
    new.queue_id,
    new.id,
    new.trigger_event_id,
    new.trigger_event_key,
    new.intent,
    new.channel,
    'queued',
    coalesce(new.score, 0),
    now(),
    now(),
    jsonb_build_object(
      'source', 'marketing_automation_runs_trigger',
      'automation_run_id', new.id,
      'payload', coalesce(new.payload, '{}'::jsonb)
    ),
    now(),
    now()
  )
  on conflict (user_id, dominant_intent)
  where user_id is not null
    and dominant_intent is not null
    and status in ('started','queued','sent','clicked','checkout_started')
  do update set
    automation_id = excluded.automation_id,
    campaign_id = excluded.campaign_id,
    queue_id = excluded.queue_id,
    automation_run_id = excluded.automation_run_id,
    first_event_id = coalesce(public.marketing_conversion_journeys.first_event_id, excluded.first_event_id),
    first_event_key = coalesce(public.marketing_conversion_journeys.first_event_key, excluded.first_event_key),
    channel = excluded.channel,
    status = case
      when public.marketing_conversion_journeys.status = 'converted' then public.marketing_conversion_journeys.status
      else 'queued'
    end,
    score = greatest(coalesce(public.marketing_conversion_journeys.score, 0), coalesce(excluded.score, 0)),
    queued_at = coalesce(public.marketing_conversion_journeys.queued_at, excluded.queued_at),
    metadata = coalesce(public.marketing_conversion_journeys.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_marketing_sync_journey_from_automation_run on public.marketing_automation_runs;
create trigger trg_marketing_sync_journey_from_automation_run
after insert on public.marketing_automation_runs
for each row
execute function public.marketing_sync_journey_from_automation_run();

create or replace function public.marketing_sync_journey_from_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_slug text;
  amount_cents integer;
  currency text;
begin
  if new.user_id is null then
    return new;
  end if;

  plan_slug := coalesce(
    new.metadata ->> 'plan_slug',
    new.metadata ->> 'plan',
    new.metadata ->> 'to_plan_slug',
    new.metadata ->> 'subscription_plan_slug'
  );

  currency := lower(coalesce(new.metadata ->> 'currency', new.metadata ->> 'conversion_currency', 'brl'));

  begin
    amount_cents := nullif(coalesce(new.metadata ->> 'amount_cents', new.metadata ->> 'amount_total', new.metadata ->> 'value_cents'), '')::integer;
  exception when others then
    amount_cents := null;
  end;

  if new.event_key = 'checkout_started' then
    perform public.marketing_mark_checkout_started(new.user_id, plan_slug, new.id);
  end if;

  if new.event_key in (
    'checkout_completed',
    'checkout.session.completed',
    'subscription_created',
    'subscription.created',
    'invoice.paid',
    'payment_succeeded',
    'plan.plus_activated',
    'plan.premium_activated'
  ) then
    perform public.marketing_mark_conversion_completed(
      new.user_id,
      plan_slug,
      amount_cents,
      currency,
      coalesce(new.source, 'harmomus'),
      new.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_marketing_sync_journey_from_event on public.marketing_events;
create trigger trg_marketing_sync_journey_from_event
after insert on public.marketing_events
for each row
execute function public.marketing_sync_journey_from_event();

-- Backfill recent queued runs into journeys in case the processor ran before this trigger existed.
insert into public.marketing_conversion_journeys (
  user_id,
  automation_id,
  campaign_id,
  queue_id,
  automation_run_id,
  first_event_id,
  first_event_key,
  dominant_intent,
  channel,
  status,
  score,
  started_at,
  queued_at,
  metadata,
  created_at,
  updated_at
)
select
  run.user_id,
  run.automation_id,
  run.campaign_id,
  run.queue_id,
  run.id,
  run.trigger_event_id,
  run.trigger_event_key,
  run.intent,
  run.channel,
  'queued',
  coalesce(run.score, 0),
  coalesce(run.created_at, now()),
  coalesce(run.processed_at, run.created_at, now()),
  jsonb_build_object('source', 'backfill_recent_automation_runs', 'automation_run_id', run.id),
  coalesce(run.created_at, now()),
  now()
from public.marketing_automation_runs run
where run.status = 'queued'
  and run.user_id is not null
  and run.created_at >= now() - interval '30 days'
on conflict (user_id, dominant_intent)
where user_id is not null
  and dominant_intent is not null
  and status in ('started','queued','sent','clicked','checkout_started')
do update set
  automation_id = excluded.automation_id,
  campaign_id = excluded.campaign_id,
  queue_id = excluded.queue_id,
  automation_run_id = excluded.automation_run_id,
  first_event_id = coalesce(public.marketing_conversion_journeys.first_event_id, excluded.first_event_id),
  first_event_key = coalesce(public.marketing_conversion_journeys.first_event_key, excluded.first_event_key),
  channel = excluded.channel,
  score = greatest(coalesce(public.marketing_conversion_journeys.score, 0), coalesce(excluded.score, 0)),
  queued_at = coalesce(public.marketing_conversion_journeys.queued_at, excluded.queued_at),
  metadata = coalesce(public.marketing_conversion_journeys.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();