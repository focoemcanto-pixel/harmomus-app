-- Canonical, gateway-agnostic communication events for Stripe and Asaas.
-- Events are emitted from consolidated billing/subscription state, not raw webhook order.

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
  if p_user_id is null or coalesce(trim(p_event_key), '') = '' or coalesce(trim(p_dedupe_key), '') = '' then
    return;
  end if;

  insert into public.marketing_events (
    user_id,
    event_key,
    event_type,
    event_label,
    action,
    channel,
    source,
    metadata,
    created_at
  )
  values (
    p_user_id,
    p_event_key,
    p_event_key,
    p_event_label,
    p_event_key,
    'billing',
    coalesce(nullif(trim(p_source), ''), 'harmomus'),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('dedupe_key', p_dedupe_key, 'canonical', true),
    now()
  )
  on conflict ((metadata->>'dedupe_key')) where metadata ? 'dedupe_key' do nothing;
end;
$$;

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
  -- Ignore no-op upserts. This blocks PAYMENT_CONFIRMED + PAYMENT_RECEIVED and
  -- invoice.paid + invoice.payment_succeeded from creating duplicate messages.
  if tg_op = 'UPDATE'
     and coalesce(old.status, '') = coalesce(new.status, '')
     and coalesce(old.amount_paid_cents, 0) = coalesce(new.amount_paid_cents, 0) then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  if lower(coalesce(new.status, '')) in ('payment_failed', 'failed', 'overdue', 'past_due') then
    v_event_key := 'subscription.payment_failed';
    v_event_label := 'Pagamento não confirmado';
    v_dedupe_key := format('%s:%s:%s', v_provider, v_invoice_id, v_event_key);

  elsif lower(coalesce(new.status, '')) = 'paid' and coalesce(new.amount_paid_cents, 0) > 0 then
    v_was_failed := tg_op = 'UPDATE' and lower(coalesce(old.status, '')) in ('payment_failed', 'failed', 'overdue', 'past_due');

    if v_was_failed then
      v_event_key := 'subscription.payment_recovered';
      v_event_label := 'Pagamento regularizado';
    else
      select count(*)
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

    v_dedupe_key := format('%s:%s:%s', v_provider, v_invoice_id, v_event_key);
  else
    -- Zero-value trial invoices and open/created invoices do not send messages.
    return new;
  end if;

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
      'amount_due_cents', new.amount_due_cents,
      'amount_paid_cents', new.amount_paid_cents,
      'currency', new.currency,
      'paid_at', new.paid_at,
      'period_start', new.period_start,
      'period_end', new.period_end,
      'invoice_url', coalesce(new.hosted_invoice_url, new.invoice_url)
    )
  );

  return new;
end;
$$;

drop trigger if exists billing_invoices_canonical_communication_trigger on public.billing_invoices;
create trigger billing_invoices_canonical_communication_trigger
after insert or update of status, amount_paid_cents on public.billing_invoices
for each row execute function public.handle_canonical_billing_invoice_event();

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
  v_gateway text := coalesce(new.gateway, old.gateway, 'unknown');
  v_gateway_subscription_id text := coalesce(new.gateway_subscription_id, new.stripe_subscription_id, old.gateway_subscription_id, old.stripe_subscription_id, new.id::text);
  v_rank_old integer;
  v_rank_new integer;
begin
  if new.user_id is null then
    return new;
  end if;

  select slug into v_new_plan from public.plans where id = new.plan_id;
  if tg_op = 'UPDATE' then
    select slug into v_old_plan from public.plans where id = old.plan_id;
  end if;

  -- Trial starts only once per gateway subscription.
  if lower(coalesce(new.status, '')) = 'trialing'
     and new.trial_ends_at is not null
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'trialing' or old.trial_ends_at is distinct from new.trial_ends_at) then
    perform public.emit_canonical_marketing_event(
      new.user_id,
      'subscription.trial_started',
      'Período gratuito iniciado',
      v_gateway,
      format('%s:%s:subscription.trial_started', v_gateway, v_gateway_subscription_id),
      jsonb_build_object('gateway', v_gateway, 'subscription_id', new.id, 'gateway_subscription_id', v_gateway_subscription_id, 'plan_slug', v_new_plan, 'trial_ends_at', new.trial_ends_at)
    );
  end if;

  -- Cancellation is based on the actual subscription state transition.
  if lower(coalesce(new.status, '')) = 'canceled'
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) <> 'canceled') then
    perform public.emit_canonical_marketing_event(
      new.user_id,
      'subscription.canceled',
      'Assinatura cancelada',
      v_gateway,
      format('%s:%s:subscription.canceled', v_gateway, v_gateway_subscription_id),
      jsonb_build_object('gateway', v_gateway, 'subscription_id', new.id, 'gateway_subscription_id', v_gateway_subscription_id, 'previous_plan_slug', v_old_plan, 'plan_slug', v_new_plan, 'current_period_end', new.current_period_end)
    );
  end if;

  -- Plan activation or transition. One canonical event is emitted, never both.
  if lower(coalesce(new.status, '')) in ('active', 'trialing')
     and (tg_op = 'INSERT' or old.plan_id is distinct from new.plan_id) then
    v_rank_old := case
      when v_old_plan = 'free' then 0
      when v_old_plan = 'plus' then 1
      when v_old_plan = 'premium' then 2
      when v_old_plan like 'ministry%' then 3
      else -1 end;
    v_rank_new := case
      when v_new_plan = 'free' then 0
      when v_new_plan = 'plus' then 1
      when v_new_plan = 'premium' then 2
      when v_new_plan like 'ministry%' then 3
      else -1 end;

    if v_old_plan is not null and v_old_plan <> v_new_plan and v_rank_old >= 0 and v_rank_new >= 0 then
      v_event_key := case when v_rank_new > v_rank_old then 'upgrade.' else 'downgrade.' end || v_old_plan || '_to_' || v_new_plan;
      v_event_label := case when v_rank_new > v_rank_old then 'Upgrade de plano' else 'Downgrade de plano' end;
    elsif v_new_plan in ('plus', 'premium') or v_new_plan like 'ministry%' then
      v_event_key := 'plan.' || case when v_new_plan like 'ministry%' then 'ministry' else v_new_plan end || '_activated';
      v_event_label := 'Plano ativado';
    end if;

    if v_event_key is not null then
      perform public.emit_canonical_marketing_event(
        new.user_id,
        v_event_key,
        v_event_label,
        v_gateway,
        format('%s:%s:%s:%s', v_gateway, v_gateway_subscription_id, v_event_key, coalesce(new.plan_id::text, 'none')),
        jsonb_build_object('gateway', v_gateway, 'subscription_id', new.id, 'gateway_subscription_id', v_gateway_subscription_id, 'previous_plan_slug', v_old_plan, 'plan_slug', v_new_plan, 'status', new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists subscriptions_canonical_communication_trigger on public.subscriptions;
create trigger subscriptions_canonical_communication_trigger
after insert or update of status, plan_id, trial_ends_at on public.subscriptions
for each row execute function public.handle_canonical_subscription_event();

-- Keep the legacy payment_failed automation active until the canonical version is tested.
-- All new canonical flows start paused to avoid overlap with current LabMessage endpoints.
insert into public.marketing_automations (
  name, description, trigger_event, intent, priority, score_weight, score_threshold,
  lookback_hours, cooldown_hours, channel, status, message_template, cta_url, audience_rule, metadata
)
values
('Período gratuito iniciado','Recepciona quem começou o período gratuito, sem confundir com cobrança.','subscription.trial_started','trial_started',5,1,1,24,720,'whatsapp','paused',E'Olá, {{nome}}! 🎉💜\n\nSeu período gratuito do Harmomus Premium começou! Você já pode explorar os kits vocais, tons, vozes e todos os recursos disponíveis no plano.\n\nAproveite esses dias para conhecer tudo com calma. Seja muito bem-vindo ao Harmomus! 🎶','https://harmomus.com', '{}'::jsonb, jsonb_build_object('category','subscription','default_message_template',E'Olá, {{nome}}! 🎉💜\n\nSeu período gratuito do Harmomus Premium começou! Você já pode explorar os kits vocais, tons, vozes e todos os recursos disponíveis no plano.\n\nAproveite esses dias para conhecer tudo com calma. Seja muito bem-vindo ao Harmomus! 🎶','default_cta_url','https://harmomus.com','canonical',true)),
('Primeiro pagamento confirmado','Confirma a primeira cobrança real depois do trial ou da contratação.','subscription.first_payment','first_payment',6,1,1,24,720,'whatsapp','paused',E'Olá, {{nome}}! 💜\n\nSeu primeiro pagamento foi confirmado e seu acesso ao Harmomus {{plano}} está ativo.\n\nSeu período atual segue normalmente até {{proxima_cobranca}}. Aproveite todos os recursos e conte com a gente na sua jornada musical! 🎶','https://harmomus.com', '{}'::jsonb, jsonb_build_object('category','billing','default_message_template',E'Olá, {{nome}}! 💜\n\nSeu primeiro pagamento foi confirmado e seu acesso ao Harmomus {{plano}} está ativo.\n\nSeu período atual segue normalmente até {{proxima_cobranca}}. Aproveite todos os recursos e conte com a gente na sua jornada musical! 🎶','default_cta_url','https://harmomus.com','canonical',true)),
('Assinatura renovada','Confirma apenas renovações posteriores à primeira cobrança.','subscription.renewed','subscription_renewed',7,1,1,24,720,'whatsapp','paused',E'Olá, {{nome}}! 💜\n\nO pagamento da sua renovação foi confirmado e sua assinatura do Harmomus continua ativa.\n\nSeu próximo ciclo está previsto para {{proxima_cobranca}}. Obrigado por continuar com a gente! 🎶','https://harmomus.com', '{}'::jsonb, jsonb_build_object('category','billing','default_message_template',E'Olá, {{nome}}! 💜\n\nO pagamento da sua renovação foi confirmado e sua assinatura do Harmomus continua ativa.\n\nSeu próximo ciclo está previsto para {{proxima_cobranca}}. Obrigado por continuar com a gente! 🎶','default_cta_url','https://harmomus.com','canonical',true)),
('Pagamento regularizado','Avisa quando uma cobrança antes atrasada ou falha é paga.','subscription.payment_recovered','payment_recovered',8,1,1,24,168,'whatsapp','paused',E'Olá, {{nome}}! 💜\n\nSeu pagamento foi confirmado e sua assinatura do Harmomus está regularizada novamente. Você já pode continuar aproveitando seus recursos normalmente! 🎶','https://harmomus.com', '{}'::jsonb, jsonb_build_object('category','billing','default_message_template',E'Olá, {{nome}}! 💜\n\nSeu pagamento foi confirmado e sua assinatura do Harmomus está regularizada novamente. Você já pode continuar aproveitando seus recursos normalmente! 🎶','default_cta_url','https://harmomus.com','canonical',true)),
('Falha de pagamento canônica','Versão multigateway baseada no estado consolidado da fatura.','subscription.payment_failed','payment_recovery_canonical',9,1,1,24,48,'whatsapp','paused',E'Olá, {{nome}}! 💜\n\nNão foi possível confirmar o pagamento da sua assinatura do Harmomus. Para evitar a interrupção do acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu, pode desconsiderar esta mensagem. 🎶','https://harmomus.com/assinatura?utm_source=crm&utm_campaign=payment_failed', '{}'::jsonb, jsonb_build_object('category','billing','default_message_template',E'Olá, {{nome}}! 💜\n\nNão foi possível confirmar o pagamento da sua assinatura do Harmomus. Para evitar a interrupção do acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu, pode desconsiderar esta mensagem. 🎶','default_cta_url','https://harmomus.com/assinatura?utm_source=crm&utm_campaign=payment_failed','canonical',true))
on conflict do nothing;

-- Canonical plan-change messages. They are editable/testable but paused until LabMessage equivalents are disabled.
insert into public.marketing_automations (
  name, description, trigger_event, intent, priority, score_weight, score_threshold,
  lookback_hours, cooldown_hours, channel, status, message_template, cta_url, audience_rule, metadata
)
select
  x.name, x.description, x.trigger_event, x.intent, x.priority, 1, 1,
  24, 720, 'whatsapp', 'paused', x.message_template, 'https://harmomus.com', '{}'::jsonb,
  jsonb_build_object('category','plan_change','default_message_template',x.message_template,'default_cta_url','https://harmomus.com','canonical',true)
from (values
  ('Upgrade Free → Plus','Confirma a evolução do plano Free para Plus.','upgrade.free_to_plus','upgrade_free_to_plus',20,E'Olá, {{nome}}! 💜\n\nSeu upgrade para o Harmomus Plus foi concluído e os novos recursos já estão disponíveis. Aproveite essa nova etapa com a gente! 🎶'),
  ('Upgrade Free → Premium','Confirma a evolução do plano Free para Premium.','upgrade.free_to_premium','upgrade_free_to_premium',21,E'Olá, {{nome}}! 💜✨\n\nSeu upgrade para o Harmomus Premium foi concluído! Todos os kits, tons, vozes e recursos Premium já estão liberados para você. 🎶'),
  ('Upgrade Plus → Premium','Confirma a evolução do plano Plus para Premium.','upgrade.plus_to_premium','upgrade_plus_to_premium',22,E'Olá, {{nome}}! 💜✨\n\nSeu plano foi atualizado do Plus para o Premium. A experiência completa do Harmomus já está liberada para você! 🎶'),
  ('Downgrade Premium → Plus','Confirma a mudança do Premium para Plus.','downgrade.premium_to_plus','downgrade_premium_to_plus',23,E'Olá, {{nome}}. Confirmamos a mudança do seu plano Premium para o Plus. Seu acesso seguirá conforme os recursos disponíveis no novo plano. 💜'),
  ('Downgrade Premium → Free','Confirma a mudança do Premium para Free.','downgrade.premium_to_free','downgrade_premium_to_free',24,E'Olá, {{nome}}. Confirmamos a mudança do seu plano Premium para o Free. Você continuará podendo acessar os recursos gratuitos do Harmomus. 💜'),
  ('Downgrade Plus → Free','Confirma a mudança do Plus para Free.','downgrade.plus_to_free','downgrade_plus_to_free',25,E'Olá, {{nome}}. Confirmamos a mudança do seu plano Plus para o Free. Você continuará podendo acessar os recursos gratuitos do Harmomus. 💜')
) as x(name,description,trigger_event,intent,priority,message_template)
on conflict do nothing;
