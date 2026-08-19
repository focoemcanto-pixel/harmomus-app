begin;

-- O Harmomus continua responsável por gatilhos, delays, cooldowns,
-- deduplicação, cancelamento por conversão e renderização da mensagem.
-- O provedor passa a apenas entregar o job pronto para a Central Foco OS,
-- onde o envio ao WhatsApp é manual.

update public.communication_whatsapp_integrations
set
  name = 'Foco OS — envio manual',
  provider = 'custom',
  active = true,
  config = jsonb_build_object(
    'apiUrl', 'https://harmomus.com/api/internal/foco-os-provider',
    'testPhone', coalesce(nullif(config->>'testPhone',''), '5571993392294'),
    'mode', 'foco_os_manual',
    'managed', true
  ),
  updated_at = now()
where active = true;

insert into public.communication_whatsapp_integrations (
  name, type, provider, active, config, limits
)
select
  'Foco OS — envio manual',
  'whatsapp',
  'custom',
  true,
  jsonb_build_object(
    'apiUrl', 'https://harmomus.com/api/internal/foco-os-provider',
    'testPhone', '5571993392294',
    'mode', 'foco_os_manual',
    'managed', true
  ),
  jsonb_build_object(
    'perMinute', 12,
    'perHour', 20,
    'perDay', 120,
    'delayMin', 180,
    'delayMax', 300,
    'pauseEvery', 10,
    'pauseMinutes', 15
  )
where not exists (
  select 1 from public.communication_whatsapp_integrations where active = true
);

commit;
