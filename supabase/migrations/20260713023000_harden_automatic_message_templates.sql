-- Harden automatic transactional messages for the current automation engine.
-- The production renderer currently supports {{nome}}, {{email}}, {{link}} and {{campanha}}.
-- Remove unsupported placeholders from automatic messages and align canonical payment failure
-- with the existing delayed/cancel-on-recovery behavior.

begin;

update public.marketing_automations
set
  message_template = E'Olá, {{nome}}! 💜\n\nSeu primeiro pagamento foi confirmado e seu acesso ao Harmomus está ativo.\n\nAproveite todos os recursos e conte com a gente na sua jornada musical! 🎶',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'default_message_template', E'Olá, {{nome}}! 💜\n\nSeu primeiro pagamento foi confirmado e seu acesso ao Harmomus está ativo.\n\nAproveite todos os recursos e conte com a gente na sua jornada musical! 🎶',
    'template_renderer_compatible', true
  ),
  updated_at = now()
where trigger_event = 'subscription.first_payment';

update public.marketing_automations
set
  message_template = E'Olá, {{nome}}! 💜\n\nO pagamento da sua renovação foi confirmado e sua assinatura do Harmomus continua ativa.\n\nObrigado por continuar com a gente. Aproveite seus estudos! 🎶',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'default_message_template', E'Olá, {{nome}}! 💜\n\nO pagamento da sua renovação foi confirmado e sua assinatura do Harmomus continua ativa.\n\nObrigado por continuar com a gente. Aproveite seus estudos! 🎶',
    'template_renderer_compatible', true
  ),
  updated_at = now()
where trigger_event = 'subscription.renewed';

update public.marketing_automations
set
  message_template = E'Olá, {{nome}}! 🎉💜\n\nSeu período gratuito do Harmomus Premium começou! Você já pode explorar os kits vocais, tons, vozes e todos os recursos disponíveis no plano.\n\nAproveite esses dias para conhecer tudo com calma. Seja muito bem-vindo ao Harmomus! 🎶',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'default_message_template', E'Olá, {{nome}}! 🎉💜\n\nSeu período gratuito do Harmomus Premium começou! Você já pode explorar os kits vocais, tons, vozes e todos os recursos disponíveis no plano.\n\nAproveite esses dias para conhecer tudo com calma. Seja muito bem-vindo ao Harmomus! 🎶',
    'template_renderer_compatible', true
  ),
  updated_at = now()
where trigger_event = 'subscription.trial_started';

update public.marketing_automations
set
  intent = 'payment_recovery',
  message_template = E'Olá, {{nome}}! 💜\n\nNão foi possível confirmar o pagamento da sua assinatura do Harmomus.\n\nPara evitar a interrupção do acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu, pode desconsiderar esta mensagem. 🎶',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'recommended_delay_minutes', 120,
    'cancel_if_recovered', true,
    'default_message_template', E'Olá, {{nome}}! 💜\n\nNão foi possível confirmar o pagamento da sua assinatura do Harmomus.\n\nPara evitar a interrupção do acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu, pode desconsiderar esta mensagem. 🎶',
    'template_renderer_compatible', true
  ),
  updated_at = now()
where trigger_event = 'subscription.payment_failed';

-- Safety audit: pause any active automatic message that still contains placeholders
-- unsupported by the current production renderer.
update public.marketing_automations
set
  status = 'paused',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'paused_reason', 'unsupported_template_placeholder',
    'paused_at', now()
  ),
  updated_at = now()
where status = 'active'
  and message_template ~* '\{\{\s*(plano|valor|proxima_cobranca)\s*\}\}';

commit;
