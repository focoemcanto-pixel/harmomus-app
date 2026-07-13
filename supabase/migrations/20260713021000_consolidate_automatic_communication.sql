-- Final, idempotent setup for Harmomus automatic transactional communication.
-- Stripe and Asaas are normalized from consolidated subscription/invoice state.
-- All new customer-facing automations start paused for manual testing.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema guards
-- ---------------------------------------------------------------------------

alter table if exists public.marketing_events
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists event_key text,
  add column if not exists event_type text,
  add column if not exists event_label text,
  add column if not exists action text,
  add column if not exists channel text,
  add column if not exists source text default 'harmomus',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

alter table if exists public.marketing_automations
  add column if not exists description text,
  add column if not exists trigger_event text,
  add column if not exists intent text,
  add column if not exists priority integer default 100,
  add column if not exists score_weight integer default 1,
  add column if not exists score_threshold integer default 1,
  add column if not exists lookback_hours integer default 24,
  add column if not exists cooldown_hours integer default 72,
  add column if not exists channel text default 'whatsapp',
  add column if not exists status text default 'paused',
  add column if not exists message_template text,
  add column if not exists cta_url text,
  add column if not exists audience_rule jsonb default '{}'::jsonb,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

-- Save the default test number in the active WhatsApp integration.
update public.communication_whatsapp_integrations
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('testPhone', '5571993392294'),
    updated_at = now()
where active = true;

-- ---------------------------------------------------------------------------
-- 2. Remove experimental/legacy database triggers
-- ---------------------------------------------------------------------------

drop trigger if exists subscriptions_emit_trial_started_event on public.subscriptions;
drop trigger if exists billing_invoices_emit_paid_event on public.billing_invoices;
drop trigger if exists subscriptions_canonical_communication_trigger on public.subscriptions;
drop trigger if exists billing_invoices_canonical_communication_trigger on public.billing_invoices;

drop function if exists public.emit_subscription_trial_started_event();
drop function if exists public.emit_paid_invoice_automation_event();
drop function if exists public.handle_canonical_subscription_event();
drop function if exists public.handle_canonical_billing_invoice_event();
drop function if exists public.emit_canonical_marketing_event(uuid,text,text,text,text,jsonb);

-- Old underscore event names must never run in parallel with canonical names.
update public.marketing_automations
set status = 'archived',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('legacy_event_name', true),
    updated_at = now()
where trigger_event in (
  'subscription_trial_started',
  'subscription_first_payment',
  'subscription_renewed'
);

-- ---------------------------------------------------------------------------
-- 3. Canonical event ledger and deduplication
-- ---------------------------------------------------------------------------

-- Remove duplicate canonical rows if a previous partial migration was applied.
with ranked as (
  select id,
         row_number() over (
           partition by metadata->>'dedupe_key'
           order by created_at asc, id asc
         ) as rn
  from public.marketing_events
  where metadata ? 'dedupe_key'
)
delete from public.marketing_events me
using ranked r
where me.id = r.id and r.rn > 1;

create unique index if not exists marketing_events_canonical_dedupe_idx
  on public.marketing_events ((metadata->>'dedupe_key'))
  where metadata ? 'dedupe_key';

create or replace function public.emit_canonical_marketing_event(
  p_user_id uuid,
  p_event_key text,
  p_event_label text,
  p_source text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null
     or coalesce(trim(p_event_key), '') = ''
     or coalesce(trim(p_dedupe_key), '') = '' then
    return;
  end if;

  insert into public.marketing_events (
    user_id, event_key, event_type, event_label, action,
    channel, source, metadata, created_at
  ) values (
    p_user_id,
    p_event_key,
    p_event_key,
    p_event_label,
    p_event_key,
    'billing',
    coalesce(nullif(trim(p_source), ''), 'harmomus'),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'dedupe_key', p_dedupe_key,
      'canonical', true
    ),
    now()
  )
  on conflict ((metadata->>'dedupe_key'))
  where metadata ? 'dedupe_key'
  do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Invoice events: first payment, renewal, failure and recovery
-- ---------------------------------------------------------------------------

create or replace function public.handle_canonical_billing_invoice_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_key text;
  v_event_label text;
  v_dedupe_key text;
  v_previous_positive_paid_count integer := 0;
  v_was_failed boolean := false;
  v_provider text := coalesce(new.provider, 'unknown');
  v_invoice_id text := coalesce(new.provider_invoice_id, new.id::text);
begin
  if new.user_id is null then
    return new;
  end if;

  -- Ignore identical upserts. This neutralizes pairs such as:
  -- Asaas PAYMENT_CONFIRMED + PAYMENT_RECEIVED and
  -- Stripe invoice.paid + invoice.payment_succeeded.
  if tg_op = 'UPDATE'
     and lower(coalesce(old.status, '')) = lower(coalesce(new.status, ''))
     and coalesce(old.amount_paid_cents, 0) = coalesce(new.amount_paid_cents, 0) then
    return new;
  end if;

  if lower(coalesce(new.status, '')) in ('payment_failed', 'failed', 'overdue', 'past_due') then
    v_event_key := 'subscription.payment_failed';
    v_event_label := 'Pagamento não confirmado';

  elsif lower(coalesce(new.status, '')) = 'paid'
        and coalesce(new.amount_paid_cents, 0) > 0 then
    v_was_failed := tg_op = 'UPDATE'
      and lower(coalesce(old.status, '')) in ('payment_failed', 'failed', 'overdue', 'past_due');

    if v_was_failed then
      v_event_key := 'subscription.payment_recovered';
      v_event_label := 'Pagamento regularizado';
    else
      select count(*)::integer
      into v_previous_positive_paid_count
      from public.billing_invoices bi
      where bi.user_id = new.user_id
        and lower(coalesce(bi.status, '')) = 'paid'
        and coalesce(bi.amount_paid_cents, 0) > 0
        and bi.id <> new.id;

      if v_previous_positive_paid_count = 0 then
        v_event_key := 'subscription.first_payment';
        v_event_label := 'Primeiro pagamento confirmado';
      else
        v_event_key := 'subscription.renewed';
        v_event_label := 'Assinatura renovada';
      end if;
    end if;
  else
    -- Open/created invoices and the R$ 0 trial invoice do not send messages.
    return new;
  end if;

  v_dedupe_key := format('%s:%s:%s', v_provider, v_invoice_id, v_event_key);

  perform public.emit_canonical_marketing_event(
    new.user_id,
    v_event_key,
    v_event_label,
    v_provider,
    v_dedupe_key,
    jsonb_build_object(
      'provider', v_provider,
      'provider_invoice_id', new.provider_invoice_id,
      'provider_event_id', new.provider_event_id,
      'subscription_id', new.subscription_id,
      'plan_id', new.plan_id,
      'amount_due_cents', new.amount_due_cents,
      'amount_paid_cents', new.amount_paid_cents,
      'currency', new.currency,
      'paid_at', new.paid_at,
      'period_start', new.period_start,
      'period_end', new.period_end,
      'next_billing_at', new.period_end,
      'invoice_url', coalesce(new.hosted_invoice_url, new.invoice_url)
    )
  );

  return new;
end;
$$;

create trigger billing_invoices_canonical_communication_trigger
after insert or update of status, amount_paid_cents
on public.billing_invoices
for each row execute function public.handle_canonical_billing_invoice_event();

-- ---------------------------------------------------------------------------
-- 5. Subscription events: trial, cancellation, activation and plan changes
-- ---------------------------------------------------------------------------

create or replace function public.handle_canonical_subscription_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_plan text;
  v_new_plan text;
  v_event_key text;
  v_event_label text;
  v_gateway text := coalesce(new.gateway, case when tg_op = 'UPDATE' then old.gateway end, 'unknown');
  v_gateway_subscription_id text;
  v_rank_old integer;
  v_rank_new integer;
begin
  if new.user_id is null then
    return new;
  end if;

  v_gateway_subscription_id := coalesce(
    new.gateway_subscription_id,
    new.stripe_subscription_id,
    case when tg_op = 'UPDATE' then old.gateway_subscription_id end,
    case when tg_op = 'UPDATE' then old.stripe_subscription_id end,
    new.id::text
  );

  select slug into v_new_plan from public.plans where id = new.plan_id;
  if tg_op = 'UPDATE' then
    select slug into v_old_plan from public.plans where id = old.plan_id;
  end if;

  -- Trial starts once per real gateway subscription.
  if lower(coalesce(new.status, '')) = 'trialing'
     and new.trial_ends_at is not null
     and (
       tg_op = 'INSERT'
       or lower(coalesce(old.status, '')) <> 'trialing'
       or old.trial_ends_at is distinct from new.trial_ends_at
     ) then
    perform public.emit_canonical_marketing_event(
      new.user_id,
      'subscription.trial_started',
      'Período gratuito iniciado',
      v_gateway,
      format('%s:%s:subscription.trial_started', v_gateway, v_gateway_subscription_id),
      jsonb_build_object(
        'gateway', v_gateway,
        'subscription_id', new.id,
        'gateway_subscription_id', v_gateway_subscription_id,
        'plan_slug', v_new_plan,
        'trial_ends_at', new.trial_ends_at,
        'current_period_end', new.current_period_end,
        'next_billing_at', new.next_billing_at
      )
    );
  end if;

  -- Cancellation is emitted only on the actual status transition.
  if lower(coalesce(new.status, '')) = 'canceled'
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'canceled') then
    perform public.emit_canonical_marketing_event(
      new.user_id,
      'subscription.canceled',
      'Assinatura cancelada',
      v_gateway,
      format('%s:%s:subscription.canceled', v_gateway, v_gateway_subscription_id),
      jsonb_build_object(
        'gateway', v_gateway,
        'subscription_id', new.id,
        'gateway_subscription_id', v_gateway_subscription_id,
        'previous_plan_slug', v_old_plan,
        'plan_slug', v_new_plan,
        'current_period_end', new.current_period_end
      )
    );
  end if;

  -- A single canonical event is emitted for plan activation OR transition.
  if lower(coalesce(new.status, '')) in ('active', 'trialing')
     and (tg_op = 'INSERT' or old.plan_id is distinct from new.plan_id) then
    v_rank_old := case
      when v_old_plan = 'free' then 0
      when v_old_plan = 'plus' then 1
      when v_old_plan = 'premium' then 2
      when v_old_plan like 'ministry%' then 3
      else -1
    end;

    v_rank_new := case
      when v_new_plan = 'free' then 0
      when v_new_plan = 'plus' then 1
      when v_new_plan = 'premium' then 2
      when v_new_plan like 'ministry%' then 3
      else -1
    end;

    if v_old_plan is not null
       and v_old_plan <> v_new_plan
       and v_rank_old >= 0
       and v_rank_new >= 0 then
      v_event_key := case when v_rank_new > v_rank_old then 'upgrade.' else 'downgrade.' end
        || v_old_plan || '_to_' || v_new_plan;
      v_event_label := case when v_rank_new > v_rank_old then 'Upgrade de plano' else 'Downgrade de plano' end;
    elsif v_new_plan in ('plus', 'premium') or v_new_plan like 'ministry%' then
      v_event_key := 'plan.'
        || case when v_new_plan like 'ministry%' then 'ministry' else v_new_plan end
        || '_activated';
      v_event_label := 'Plano ativado';
    end if;

    if v_event_key is not null then
      perform public.emit_canonical_marketing_event(
        new.user_id,
        v_event_key,
        v_event_label,
        v_gateway,
        format(
          '%s:%s:%s:%s',
          v_gateway,
          v_gateway_subscription_id,
          v_event_key,
          coalesce(new.plan_id::text, 'none')
        ),
        jsonb_build_object(
          'gateway', v_gateway,
          'subscription_id', new.id,
          'gateway_subscription_id', v_gateway_subscription_id,
          'previous_plan_slug', v_old_plan,
          'plan_slug', v_new_plan,
          'status', new.status
        )
      );
    end if;
  end if;

  return new;
end;
$$;

create trigger subscriptions_canonical_communication_trigger
after insert or update of status, plan_id, trial_ends_at
on public.subscriptions
for each row execute function public.handle_canonical_subscription_event();

-- ---------------------------------------------------------------------------
-- 6. Editable message catalog
-- ---------------------------------------------------------------------------

create temporary table _automatic_message_defaults (
  name text,
  description text,
  trigger_event text,
  intent text,
  priority integer,
  cooldown_hours integer,
  message_template text,
  cta_url text,
  category text
) on commit drop;

insert into _automatic_message_defaults values
('Período gratuito iniciado','Recepciona quem começou os 7 dias gratuitos sem comunicar cobrança.','subscription.trial_started','trial_started',5,720,E'Olá, {{nome}}! 🎉💜\n\nSeu período gratuito do Harmomus Premium começou! Você já pode explorar os kits vocais, tons, vozes e todos os recursos disponíveis no plano.\n\nAproveite esses dias para conhecer tudo com calma. Seja muito bem-vindo ao Harmomus! 🎶','https://harmomus.com','subscription'),
('Primeiro pagamento confirmado','Confirma a primeira cobrança real depois do trial ou da contratação.','subscription.first_payment','first_payment',6,720,E'Olá, {{nome}}! 💜\n\nSeu primeiro pagamento foi confirmado e seu acesso ao Harmomus {{plano}} está ativo.\n\nSeu período atual segue normalmente até {{proxima_cobranca}}. Aproveite todos os recursos e conte com a gente na sua jornada musical! 🎶','https://harmomus.com/assinatura','billing'),
('Assinatura renovada','Confirma apenas cobranças posteriores à primeira cobrança.','subscription.renewed','subscription_renewed',7,720,E'Olá, {{nome}}! 💜\n\nO pagamento da sua renovação foi confirmado e sua assinatura do Harmomus continua ativa.\n\nSeu próximo ciclo está previsto para {{proxima_cobranca}}. Obrigado por continuar com a gente! 🎶','https://harmomus.com/assinatura','billing'),
('Pagamento regularizado','Avisa quando uma cobrança anteriormente atrasada ou falha é paga.','subscription.payment_recovered','payment_recovered',8,168,E'Olá, {{nome}}! 💜\n\nSeu pagamento foi confirmado e sua assinatura do Harmomus está regularizada novamente. Você já pode continuar aproveitando seus recursos normalmente! 🎶','https://harmomus.com/assinatura','billing'),
('Falha de pagamento canônica','Fluxo multigateway baseado no estado consolidado da cobrança.','subscription.payment_failed','payment_recovery_canonical',9,48,E'Olá, {{nome}}! 💜\n\nNão foi possível confirmar o pagamento da sua assinatura do Harmomus. Para evitar a interrupção do acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu, pode desconsiderar esta mensagem. 🎶','https://harmomus.com/assinatura?utm_source=crm&utm_campaign=payment_failed','billing'),
('Assinatura cancelada','Confirma o cancelamento sem prometer encerramento imediato quando ainda há período contratado.','subscription.canceled','subscription_canceled',10,720,E'Olá, {{nome}}. Confirmamos o cancelamento da sua assinatura do Harmomus.\n\nQuando aplicável, seu acesso continuará disponível até o fim do período já contratado.\n\nFoi muito bom ter você com a gente, e as portas estarão sempre abertas caso queira voltar. 💜🎶','https://harmomus.com/assinatura','subscription'),
('Plano Plus ativado','Confirma uma ativação Plus que não seja uma transição identificada entre planos.','plan.plus_activated','plus_activated',11,720,E'Olá, {{nome}}! Temos uma ótima notícia! 💜\n\nSeu acesso ao Harmomus Plus está ativo e você já pode aproveitar todos os recursos disponíveis no seu plano.\n\nAproveite essa nova etapa da sua jornada musical com a gente! 🎶','https://harmomus.com','subscription'),
('Plano Premium ativado','Confirma uma ativação Premium que não seja uma transição identificada entre planos.','plan.premium_activated','premium_activated',12,720,E'Olá, {{nome}}! Seu acesso ao Harmomus Premium está ativo! 💜✨\n\nAgora você tem acesso à experiência mais completa do Harmomus, com todos os kits vocais, tons, vozes e recursos disponíveis no seu plano.\n\nAproveite ao máximo e conte com a gente na sua jornada musical! 🎶','https://harmomus.com','subscription'),
('Plano Ministerial ativado','Recepciona a ativação de um plano para ministérios.','plan.ministry_activated','ministry_activated',13,720,E'Olá, {{nome}}! 💜\n\nSeu plano Harmomus Ministerial está ativo. Agora você já pode organizar sua equipe e aproveitar os recursos disponíveis para o seu ministério. 🎶','https://harmomus.com','subscription'),
('Upgrade Free → Plus','Confirma a evolução do plano Free para Plus.','upgrade.free_to_plus','upgrade_free_to_plus',20,720,E'Olá, {{nome}}! 💜\n\nSeu upgrade para o Harmomus Plus foi concluído e os novos recursos já estão disponíveis. Aproveite essa nova etapa com a gente! 🎶','https://harmomus.com','plan_change'),
('Upgrade Free → Premium','Confirma a evolução do plano Free para Premium.','upgrade.free_to_premium','upgrade_free_to_premium',21,720,E'Olá, {{nome}}! 💜✨\n\nSeu upgrade para o Harmomus Premium foi concluído! Todos os kits, tons, vozes e recursos Premium já estão liberados para você. 🎶','https://harmomus.com','plan_change'),
('Upgrade Plus → Premium','Confirma a evolução do plano Plus para Premium.','upgrade.plus_to_premium','upgrade_plus_to_premium',22,720,E'Olá, {{nome}}! 💜✨\n\nSeu plano foi atualizado do Plus para o Premium. A experiência completa do Harmomus já está liberada para você! 🎶','https://harmomus.com','plan_change'),
('Downgrade Premium → Plus','Confirma a mudança do Premium para Plus.','downgrade.premium_to_plus','downgrade_premium_to_plus',23,720,E'Olá, {{nome}}. Confirmamos a mudança do seu plano Premium para o Plus. Seu acesso seguirá conforme os recursos disponíveis no novo plano. 💜','https://harmomus.com/assinatura','plan_change'),
('Downgrade Premium → Free','Confirma a mudança do Premium para Free.','downgrade.premium_to_free','downgrade_premium_to_free',24,720,E'Olá, {{nome}}. Confirmamos a mudança do seu plano Premium para o Free. Você continuará podendo acessar os recursos gratuitos do Harmomus. 💜','https://harmomus.com/assinatura','plan_change'),
('Downgrade Plus → Free','Confirma a mudança do Plus para Free.','downgrade.plus_to_free','downgrade_plus_to_free',25,720,E'Olá, {{nome}}. Confirmamos a mudança do seu plano Plus para o Free. Você continuará podendo acessar os recursos gratuitos do Harmomus. 💜','https://harmomus.com/assinatura','plan_change');

-- Update existing canonical rows without changing an administrator's edited text.
update public.marketing_automations ma
set name = d.name,
    description = d.description,
    intent = d.intent,
    priority = d.priority,
    cooldown_hours = d.cooldown_hours,
    channel = 'whatsapp',
    metadata = coalesce(ma.metadata, '{}'::jsonb) || jsonb_build_object(
      'category', d.category,
      'canonical', true,
      'default_message_template', d.message_template,
      'default_cta_url', d.cta_url
    ),
    updated_at = now()
from _automatic_message_defaults d
where ma.trigger_event = d.trigger_event;

-- Insert missing canonical rows. All start paused for manual testing.
insert into public.marketing_automations (
  name, description, trigger_event, intent, priority,
  score_weight, score_threshold, lookback_hours, cooldown_hours,
  channel, status, message_template, cta_url, audience_rule, metadata
)
select
  d.name,
  d.description,
  d.trigger_event,
  d.intent,
  d.priority,
  1,
  1,
  24,
  d.cooldown_hours,
  'whatsapp',
  'paused',
  d.message_template,
  d.cta_url,
  '{}'::jsonb,
  jsonb_build_object(
    'category', d.category,
    'canonical', true,
    'default_message_template', d.message_template,
    'default_cta_url', d.cta_url
  )
from _automatic_message_defaults d
where not exists (
  select 1
  from public.marketing_automations ma
  where ma.trigger_event = d.trigger_event
);

-- Keep the already-working internal recovery flows intact.
-- Do not activate canonical payment failure until the legacy payment_failed flow is disabled.

commit;
