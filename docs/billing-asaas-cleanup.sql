-- Harmomus / Asaas billing cleanup and validation
-- Use este script no SQL Editor do Supabase.
-- Objetivo: garantir 1 assinatura por usuário/perfil e validar datas/status após webhooks Asaas.

-- 1) Encontrar usuários com mais de uma assinatura local.
select
  p.id as profile_id,
  p.full_name,
  p.email,
  count(s.id) as subscriptions_count,
  jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'gateway', s.gateway,
      'plan_id', s.plan_id,
      'current_period_end', s.current_period_end,
      'next_billing_at', s.next_billing_at,
      'gateway_subscription_id', s.gateway_subscription_id,
      'created_at', s.created_at,
      'updated_at', s.updated_at
    )
    order by s.updated_at desc nulls last, s.created_at desc
  ) as subscriptions
from profiles p
join subscriptions s on s.user_id = p.id
group by p.id, p.full_name, p.email
having count(s.id) > 1
order by subscriptions_count desc, p.email;

-- 2) Encontrar assinaturas Asaas em atraso que nasceram/foram atualizadas com vencimento no mesmo dia.
-- Esses são candidatos a checkout sem pagamento confirmado ou webhook de sucesso que não chegou.
select
  p.id as profile_id,
  p.full_name,
  p.email,
  s.id as subscription_id,
  s.status,
  s.gateway,
  s.current_period_end,
  s.next_billing_at,
  s.gateway_customer_id,
  s.gateway_subscription_id,
  s.created_at,
  s.updated_at
from subscriptions s
left join profiles p on p.id = s.user_id
where s.gateway = 'asaas'
  and s.status in ('pending', 'overdue', 'past_due', 'incomplete')
order by s.updated_at desc nulls last, s.created_at desc;

-- 3) Conferir eventos recebidos do Asaas por assinatura.
-- Troque o valor abaixo pelo gateway_subscription_id desejado.
-- Ex.: Alan/Fabiane.
select
  created_at,
  event_type,
  processed,
  processed_at,
  error_message,
  payload->>'event' as asaas_event,
  payload->'payment'->>'status' as payment_status,
  payload->'payment'->>'dueDate' as due_date,
  payload->'payment'->>'paymentDate' as payment_date,
  payload->'payment'->>'clientPaymentDate' as client_payment_date,
  payload->'payment'->>'subscription' as payment_subscription_id,
  payload->'subscription'->>'id' as subscription_event_id
from billing_events
where provider = 'asaas'
  and (
    payload->>'gateway_subscription_id' = '<GATEWAY_SUBSCRIPTION_ID>'
    or payload->'payment'->>'subscription' = '<GATEWAY_SUBSCRIPTION_ID>'
    or payload->'subscription'->>'id' = '<GATEWAY_SUBSCRIPTION_ID>'
  )
order by created_at desc;

-- 4) Correção manual segura para um usuário duplicado.
-- Regra: manter a assinatura Asaas se ela já é a assinatura atual do checkout/pagamento.
-- Depois de confirmar qual id manter, cancele/remova a linha duplicada antiga.
-- ATENÇÃO: rode primeiro como SELECT para conferir.

-- Exemplo: arquivar/cancelar uma assinatura legacy/free duplicada mantendo a Asaas.
-- update subscriptions
-- set status = 'canceled',
--     auto_renew = false,
--     canceled_at = coalesce(canceled_at, now()),
--     updated_at = now()
-- where id = '<SUBSCRIPTION_DUPLICADA_LEGACY_ID>'
--   and gateway in ('legacy', 'pms')
--   and user_id = '<PROFILE_ID>';

-- 5) Se o Asaas mostra pagamento pago, mas o Harmomus ficou pending/overdue,
-- primeiro confirme o evento em billing_events. Se o evento de pagamento recebido não chegou,
-- o ideal é reenviar o webhook pelo painel Asaas.
-- Só use correção manual se o pagamento estiver confirmado no Asaas.
-- Ajuste o plano conforme o plano comprado.

-- update subscriptions
-- set status = 'active',
--     current_period_end = now() + interval '30 days',
--     next_billing_at = now() + interval '30 days',
--     updated_at = now(),
--     last_webhook_event = coalesce(last_webhook_event, 'manual.payment_confirmed')
-- where id = '<SUBSCRIPTION_ASAAS_ID>'
--   and gateway = 'asaas'
--   and status in ('pending', 'overdue', 'past_due', 'incomplete');

-- 6) Validação final: cada usuário deve aparecer no máximo uma vez.
select
  p.id as profile_id,
  p.full_name,
  p.email,
  count(s.id) filter (where coalesce(s.status, '') not in ('canceled', 'cancelled', 'expired')) as open_subscriptions,
  jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'status', s.status,
      'gateway', s.gateway,
      'current_period_end', s.current_period_end,
      'next_billing_at', s.next_billing_at,
      'updated_at', s.updated_at
    )
    order by s.updated_at desc nulls last, s.created_at desc
  ) as subscriptions
from profiles p
join subscriptions s on s.user_id = p.id
group by p.id, p.full_name, p.email
having count(s.id) filter (where coalesce(s.status, '') not in ('canceled', 'cancelled', 'expired')) > 1
order by p.email;
