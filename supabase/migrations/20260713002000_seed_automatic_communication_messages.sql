-- Friendly, editable defaults for the Harmomus automatic communication center.
-- Transactional messages that still depend on normalized billing events start paused.

update public.communication_whatsapp_integrations
set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('testPhone', '5571993392294'),
    updated_at = now()
where active = true;

update public.marketing_automations
set
  name = 'Pagamento não confirmado',
  description = 'Avisa com cuidado quando a cobrança não é confirmada e oferece o caminho de regularização.',
  message_template = E'Olá, {{nome}}! 💜\n\nIdentificamos que não foi possível confirmar o pagamento da sua assinatura do Harmomus. Às vezes isso acontece por um motivo simples, como limite ou autorização do cartão.\n\nPara continuar aproveitando seu acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu a situação, pode desconsiderar esta mensagem. 🎶',
  cta_url = 'https://harmomus.com/assinatura?utm_source=crm&utm_campaign=payment_failed',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'category', 'billing',
    'default_message_template', E'Olá, {{nome}}! 💜\n\nIdentificamos que não foi possível confirmar o pagamento da sua assinatura do Harmomus. Às vezes isso acontece por um motivo simples, como limite ou autorização do cartão.\n\nPara continuar aproveitando seu acesso, regularize por aqui:\n{{link}}\n\nSe você já resolveu a situação, pode desconsiderar esta mensagem. 🎶',
    'default_cta_url', 'https://harmomus.com/assinatura?utm_source=crm&utm_campaign=payment_failed'
  ),
  updated_at = now()
where trigger_event = 'payment_failed';

update public.marketing_automations
set
  name = 'Recuperação de checkout',
  description = 'Retoma o contato duas horas depois, desde que a assinatura ainda não tenha sido concluída.',
  message_template = E'Olá, {{nome}}! 💜\n\nVimos que você esteve a um passo de liberar novos recursos no Harmomus. Se aconteceu algum imprevisto ou você não conseguiu concluir, pode continuar de onde parou:\n\n{{link}}\n\nEsperamos você! 🎶',
  cta_url = 'https://harmomus.com/assinar?utm_source=crm&utm_campaign=checkout_abandoned',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'category', 'recovery',
    'recommended_delay_minutes', 120,
    'default_message_template', E'Olá, {{nome}}! 💜\n\nVimos que você esteve a um passo de liberar novos recursos no Harmomus. Se aconteceu algum imprevisto ou você não conseguiu concluir, pode continuar de onde parou:\n\n{{link}}\n\nEsperamos você! 🎶',
    'default_cta_url', 'https://harmomus.com/assinar?utm_source=crm&utm_campaign=checkout_abandoned'
  ),
  updated_at = now()
where intent = 'checkout_abandoned';

update public.marketing_automations
set
  message_template = E'Olá, {{nome}}! 💜\n\nVocê tentou acessar um recurso Premium do Harmomus. Para liberar todos os kits, tons, vozes e ferramentas disponíveis, conheça o plano Premium:\n\n{{link}}\n\nContinue evoluindo com a gente! 🎶',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'default_message_template', E'Olá, {{nome}}! 💜\n\nVocê tentou acessar um recurso Premium do Harmomus. Para liberar todos os kits, tons, vozes e ferramentas disponíveis, conheça o plano Premium:\n\n{{link}}\n\nContinue evoluindo com a gente! 🎶',
    'default_cta_url', 'https://harmomus.com/assinar?plano=premium&utm_source=crm&utm_campaign=premium_blocked'
  ),
  updated_at = now()
where trigger_event = 'premium_blocked';

insert into public.marketing_automations (
  name, description, trigger_event, intent, priority, score_weight, score_threshold,
  lookback_hours, cooldown_hours, channel, status, message_template, cta_url, audience_rule, metadata
)
values
(
  'Boas-vindas ao plano Free',
  'Recepciona novos inscritos e apresenta o início da jornada no Harmomus.',
  'subscription.free.created', 'free_welcome', 40, 1, 1, 24, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}! Que bom ter você por aqui! 💜🎶\n\nSeu cadastro no Harmomus foi realizado com sucesso e você já pode começar a explorar os recursos disponíveis no seu plano.\n\nEsperamos ajudar você a estudar, cantar e evoluir cada vez mais. Seja muito bem-vindo ao Harmomus!',
  'https://harmomus.com', '{}'::jsonb,
  jsonb_build_object('category','subscription','default_message_template',E'Olá, {{nome}}! Que bom ter você por aqui! 💜🎶\n\nSeu cadastro no Harmomus foi realizado com sucesso e você já pode começar a explorar os recursos disponíveis no seu plano.\n\nEsperamos ajudar você a estudar, cantar e evoluir cada vez mais. Seja muito bem-vindo ao Harmomus!','default_cta_url','https://harmomus.com','requires_normalized_event',true)
),
(
  'Plano Plus ativado',
  'Confirma a ativação do acesso Plus sem criar impressão de cobrança duplicada.',
  'plan.plus_activated', 'plus_activated', 41, 1, 1, 24, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}! Temos uma ótima notícia! 💜\n\nSeu acesso ao Harmomus Plus está ativo e você já pode aproveitar todos os recursos disponíveis no seu plano.\n\nAproveite essa nova etapa da sua jornada musical com a gente! 🎶',
  'https://harmomus.com', '{}'::jsonb,
  jsonb_build_object('category','subscription','default_message_template',E'Olá, {{nome}}! Temos uma ótima notícia! 💜\n\nSeu acesso ao Harmomus Plus está ativo e você já pode aproveitar todos os recursos disponíveis no seu plano.\n\nAproveite essa nova etapa da sua jornada musical com a gente! 🎶','default_cta_url','https://harmomus.com','requires_normalized_event',true)
),
(
  'Plano Premium ativado',
  'Confirma a ativação do acesso Premium com uma mensagem única e receptiva.',
  'plan.premium_activated', 'premium_activated', 42, 1, 1, 24, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}! Seu acesso ao Harmomus Premium está ativo! 💜✨\n\nAgora você tem acesso à experiência mais completa do Harmomus, com todos os kits vocais, tons, vozes e recursos disponíveis no seu plano.\n\nAproveite ao máximo e conte com a gente na sua jornada musical! 🎶',
  'https://harmomus.com', '{}'::jsonb,
  jsonb_build_object('category','subscription','default_message_template',E'Olá, {{nome}}! Seu acesso ao Harmomus Premium está ativo! 💜✨\n\nAgora você tem acesso à experiência mais completa do Harmomus, com todos os kits vocais, tons, vozes e recursos disponíveis no seu plano.\n\nAproveite ao máximo e conte com a gente na sua jornada musical! 🎶','default_cta_url','https://harmomus.com','requires_normalized_event',true)
),
(
  'Assinatura cancelada',
  'Confirma o cancelamento e explica a continuidade do acesso quando aplicável.',
  'subscription.canceled', 'subscription_canceled', 43, 1, 1, 24, 168, 'whatsapp', 'paused',
  E'Olá, {{nome}}. Confirmamos o cancelamento da sua assinatura do Harmomus.\n\nQuando aplicável, seu acesso continuará disponível até o fim do período já contratado.\n\nFoi muito bom ter você com a gente, e as portas estarão sempre abertas caso queira voltar. 💜🎶',
  'https://harmomus.com/assinatura', '{}'::jsonb,
  jsonb_build_object('category','subscription','default_message_template',E'Olá, {{nome}}. Confirmamos o cancelamento da sua assinatura do Harmomus.\n\nQuando aplicável, seu acesso continuará disponível até o fim do período já contratado.\n\nFoi muito bom ter você com a gente, e as portas estarão sempre abertas caso queira voltar. 💜🎶','default_cta_url','https://harmomus.com/assinatura','requires_normalized_event',true)
)
on conflict do nothing;
