-- Normalized transactional events for automatic communication.
-- Distinguishes trial start, first paid invoice and later renewals.

create or replace function public.emit_subscription_trial_started_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_ref text;
begin
  subscription_ref := coalesce(new.gateway_subscription_id, new.stripe_subscription_id, new.id::text);

  if new.status = 'trialing'
     and new.trial_ends_at is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status or old.trial_ends_at is distinct from new.trial_ends_at)
     and not exists (
       select 1
       from public.marketing_events me
       where me.user_id = new.user_id
         and me.event_key = 'subscription_trial_started'
         and coalesce(me.metadata->>'subscription_ref', '') = subscription_ref
     )
  then
    insert into public.marketing_events (
      user_id, event_key, event_type, event_label, action, channel, source, metadata, created_at
    ) values (
      new.user_id,
      'subscription_trial_started',
      'subscription.trial_started',
      'Período gratuito iniciado',
      'trial_started',
      'billing',
      coalesce(new.gateway, 'harmomus'),
      jsonb_build_object(
        'subscription_ref', subscription_ref,
        'subscription_id', new.id,
        'plan_id', new.plan_id,
        'gateway', new.gateway,
        'trial_ends_at', new.trial_ends_at,
        'current_period_end', new.current_period_end
      ),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists subscriptions_emit_trial_started_event on public.subscriptions;
create trigger subscriptions_emit_trial_started_event
after insert or update of status, trial_ends_at on public.subscriptions
for each row execute function public.emit_subscription_trial_started_event();

create or replace function public.emit_paid_invoice_automation_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prior_paid_count integer := 0;
  normalized_event_key text;
  normalized_event_type text;
  normalized_event_label text;
begin
  if new.user_id is null
     or coalesce(new.status, '') <> 'paid'
     or coalesce(new.amount_paid_cents, 0) <= 0
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(old.status, '') = 'paid'
     and coalesce(old.amount_paid_cents, 0) = coalesce(new.amount_paid_cents, 0)
  then
    return new;
  end if;

  if exists (
    select 1
    from public.marketing_events me
    where me.user_id = new.user_id
      and me.event_key in ('subscription_first_payment', 'subscription_renewed')
      and coalesce(me.metadata->>'provider_invoice_id', '') = new.provider_invoice_id
  ) then
    return new;
  end if;

  select count(*)::integer
  into prior_paid_count
  from public.billing_invoices bi
  where bi.user_id = new.user_id
    and bi.provider = new.provider
    and bi.status = 'paid'
    and coalesce(bi.amount_paid_cents, 0) > 0
    and bi.provider_invoice_id <> new.provider_invoice_id;

  if prior_paid_count = 0 then
    normalized_event_key := 'subscription_first_payment';
    normalized_event_type := 'subscription.first_payment';
    normalized_event_label := 'Primeiro pagamento confirmado';
  else
    normalized_event_key := 'subscription_renewed';
    normalized_event_type := 'subscription.renewed';
    normalized_event_label := 'Assinatura renovada';
  end if;

  insert into public.marketing_events (
    user_id, event_key, event_type, event_label, action, channel, source, metadata, created_at
  ) values (
    new.user_id,
    normalized_event_key,
    normalized_event_type,
    normalized_event_label,
    case when prior_paid_count = 0 then 'first_payment' else 'renewal' end,
    'billing',
    coalesce(new.provider, 'harmomus'),
    jsonb_build_object(
      'provider', new.provider,
      'provider_invoice_id', new.provider_invoice_id,
      'provider_event_id', new.provider_event_id,
      'subscription_id', new.subscription_id,
      'stripe_subscription_id', new.stripe_subscription_id,
      'plan_id', new.plan_id,
      'amount_paid_cents', new.amount_paid_cents,
      'currency', new.currency,
      'paid_at', new.paid_at,
      'period_start', new.period_start,
      'period_end', new.period_end,
      'prior_paid_invoice_count', prior_paid_count
    ),
    coalesce(new.paid_at, now())
  );

  return new;
end;
$$;

drop trigger if exists billing_invoices_emit_paid_event on public.billing_invoices;
create trigger billing_invoices_emit_paid_event
after insert or update of status, amount_paid_cents on public.billing_invoices
for each row execute function public.emit_paid_invoice_automation_event();

-- Register editable messages. They start paused to avoid overlap with LabMessage
-- until each one is manually tested and the equivalent external webhook is disabled.
insert into public.marketing_automations (
  name, description, trigger_event, intent, priority, score_weight, score_threshold,
  lookback_hours, cooldown_hours, channel, status, message_template, cta_url, audience_rule, metadata
)
select
  'Período gratuito iniciado',
  'Recepciona o assinante assim que os 7 dias gratuitos começam.',
  'subscription_trial_started',
  'trial_welcome',
  11, 1, 1, 72, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}! 🎉 Que bom ter você com a gente!\n\nSeu período gratuito de 7 dias do Harmomus {{plano}} começou e você já pode aproveitar todos os recursos disponíveis no plano.\n\nExplore os kits vocais, tons, vozes e ferramentas que preparamos para tornar seus estudos ainda mais completos. 💜🎶\n\nSeja muito bem-vindo ao Harmomus!',
  'https://harmomus.com',
  '{}'::jsonb,
  jsonb_build_object(
    'category','subscription',
    'billing_stage','trial_started',
    'default_message_template',E'Olá, {{nome}}! 🎉 Que bom ter você com a gente!\n\nSeu período gratuito de 7 dias do Harmomus {{plano}} começou e você já pode aproveitar todos os recursos disponíveis no plano.\n\nExplore os kits vocais, tons, vozes e ferramentas que preparamos para tornar seus estudos ainda mais completos. 💜🎶\n\nSeja muito bem-vindo ao Harmomus!',
    'default_cta_url','https://harmomus.com'
  )
where not exists (
  select 1 from public.marketing_automations where trigger_event = 'subscription_trial_started'
);

insert into public.marketing_automations (
  name, description, trigger_event, intent, priority, score_weight, score_threshold,
  lookback_hours, cooldown_hours, channel, status, message_template, cta_url, audience_rule, metadata
)
select
  'Primeiro pagamento confirmado',
  'Confirma a primeira cobrança real após o período gratuito, sem parecer uma nova assinatura.',
  'subscription_first_payment',
  'first_payment_confirmation',
  12, 1, 1, 72, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}! 💜\n\nSeu período gratuito foi concluído e o primeiro pagamento da sua assinatura Harmomus {{plano}} foi confirmado com sucesso.\n\nSeu acesso continua ativo normalmente, e a próxima cobrança está prevista para {{proxima_cobranca}}.\n\nContinue aproveitando todos os recursos e conte com a gente na sua jornada musical! 🎶',
  'https://harmomus.com/assinatura',
  '{}'::jsonb,
  jsonb_build_object(
    'category','billing',
    'billing_stage','first_payment',
    'default_message_template',E'Olá, {{nome}}! 💜\n\nSeu período gratuito foi concluído e o primeiro pagamento da sua assinatura Harmomus {{plano}} foi confirmado com sucesso.\n\nSeu acesso continua ativo normalmente, e a próxima cobrança está prevista para {{proxima_cobranca}}.\n\nContinue aproveitando todos os recursos e conte com a gente na sua jornada musical! 🎶',
    'default_cta_url','https://harmomus.com/assinatura'
  )
where not exists (
  select 1 from public.marketing_automations where trigger_event = 'subscription_first_payment'
);

insert into public.marketing_automations (
  name, description, trigger_event, intent, priority, score_weight, score_threshold,
  lookback_hours, cooldown_hours, channel, status, message_template, cta_url, audience_rule, metadata
)
select
  'Assinatura renovada',
  'Confirma apenas cobranças mensais posteriores à primeira cobrança paga.',
  'subscription_renewed',
  'renewal_confirmation',
  13, 1, 1, 72, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}! Sua assinatura Harmomus {{plano}} foi renovada com sucesso! 💜\n\nO pagamento de {{valor}} foi confirmado e seu acesso continua ativo até o próximo ciclo.\n\nObrigado por continuar com a gente. Aproveite seus estudos! 🎶',
  'https://harmomus.com/assinatura',
  '{}'::jsonb,
  jsonb_build_object(
    'category','billing',
    'billing_stage','renewal',
    'default_message_template',E'Olá, {{nome}}! Sua assinatura Harmomus {{plano}} foi renovada com sucesso! 💜\n\nO pagamento de {{valor}} foi confirmado e seu acesso continua ativo até o próximo ciclo.\n\nObrigado por continuar com a gente. Aproveite seus estudos! 🎶',
    'default_cta_url','https://harmomus.com/assinatura'
  )
where not exists (
  select 1 from public.marketing_automations where trigger_event = 'subscription_renewed'
);
