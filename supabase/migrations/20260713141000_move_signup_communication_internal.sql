begin;

-- Desativa os endpoints externos de comunicação que já possuem fluxo interno.
update public.webhook_endpoints
set
  active = false,
  updated_at = now()
where active = true
  and events::text ~* '(subscription\.free\.created|subscription\.canceled|subscription\.payment_failed|plan\.(plus|premium|ministry)_activated|upgrade\.|downgrade\.|checkout\.(abandoned|plus\.abandoned|premium\.abandoned))';

-- Cancela entregas externas ainda pendentes desses eventos.
update public.webhook_dispatch_queue
set
  status = 'canceled',
  last_error = 'Cancelado: comunicação migrada para a Central interna do Harmomus.',
  processed_at = coalesce(processed_at, now()),
  updated_at = now()
where status in ('pending', 'queued', 'retrying', 'processing')
  and event ~* '^(subscription\.free\.created|subscription\.canceled|subscription\.payment_failed|plan\.(plus|premium|ministry)_activated|upgrade\.|downgrade\.|checkout\.(abandoned|plus\.abandoned|premium\.abandoned))';

-- Cria/atualiza a mensagem interna de cadastro Free.
update public.marketing_automations
set
  name = 'Boas-vindas ao Harmomus Free',
  description = 'Recepciona novos usuários que concluíram o cadastro gratuito.',
  intent = 'free_signup_welcome',
  channel = 'whatsapp',
  status = 'active',
  priority = 4,
  cooldown_hours = 720,
  message_template = E'Olá, {{nome}}! 💜🎶\n\nSeu cadastro no Harmomus foi concluído com sucesso! Você já pode acessar os recursos gratuitos e começar seus estudos.\n\nSeja muito bem-vindo! {{link}}',
  cta_url = 'https://harmomus.com',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'category', 'onboarding',
    'transactional', true,
    'bypass_global_cooldown', true,
    'bypass_daily_limit', true,
    'communication_owner', 'harmomus_internal',
    'external_webhook_disabled', true
  ),
  updated_at = now()
where trigger_event = 'subscription.free.created';

insert into public.marketing_automations (
  name,
  description,
  trigger_event,
  intent,
  priority,
  score_weight,
  score_threshold,
  lookback_hours,
  cooldown_hours,
  channel,
  status,
  message_template,
  cta_url,
  audience_rule,
  metadata
)
select
  'Boas-vindas ao Harmomus Free',
  'Recepciona novos usuários que concluíram o cadastro gratuito.',
  'subscription.free.created',
  'free_signup_welcome',
  4,
  1,
  1,
  24,
  720,
  'whatsapp',
  'active',
  E'Olá, {{nome}}! 💜🎶\n\nSeu cadastro no Harmomus foi concluído com sucesso! Você já pode acessar os recursos gratuitos e começar seus estudos.\n\nSeja muito bem-vindo! {{link}}',
  'https://harmomus.com',
  '{}'::jsonb,
  jsonb_build_object(
    'category', 'onboarding',
    'transactional', true,
    'bypass_global_cooldown', true,
    'bypass_daily_limit', true,
    'communication_owner', 'harmomus_internal',
    'external_webhook_disabled', true
  )
where not exists (
  select 1
  from public.marketing_automations
  where trigger_event = 'subscription.free.created'
);

-- Cadastro pago iniciado não envia confirmação de assinatura.
-- Serve apenas como evento de auditoria/funil até ocorrer trial ou pagamento real.
update public.marketing_automations
set status = 'archived', updated_at = now()
where trigger_event in (
  'subscription.plus.created',
  'subscription.premium.created',
  'subscription.ministry_10.created',
  'subscription.ministry_20.created',
  'subscription.ministry_40.created',
  'signup.paid_started'
);

commit;
