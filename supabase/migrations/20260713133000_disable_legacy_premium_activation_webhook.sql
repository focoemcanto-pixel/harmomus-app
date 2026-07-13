begin;

-- A ativação genérica de Premium era disparada por customer.subscription.updated,
-- inclusive no fim do trial, após recuperação e na abertura de um novo ciclo.
-- A Central interna agora usa eventos canônicos específicos.
update public.webhook_endpoints
set
  active = false,
  updated_at = now()
where active = true
  and (
    name = 'ASSINATURA PREMIUM'
    or events::text ilike '%plan.premium_activated%'
  );

-- Impede que trabalhos antigos ainda pendentes sejam enviados depois da desativação.
update public.webhook_dispatch_queue
set
  status = 'canceled',
  last_error = 'Cancelado: evento legado plan.premium_activated substituído pela Central canônica.',
  processed_at = coalesce(processed_at, now()),
  updated_at = now()
where event = 'plan.premium_activated'
  and status in ('pending', 'queued', 'retrying', 'processing');

-- O gatilho genérico permanece disponível para histórico, mas não deve enviar mensagem.
update public.marketing_automations
set
  status = 'paused',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'paused_reason', 'generic_activation_replaced_by_canonical_billing_events',
    'paused_at', now()
  ),
  updated_at = now()
where trigger_event = 'plan.premium_activated';

commit;
