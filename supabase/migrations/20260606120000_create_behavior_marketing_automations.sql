-- Behavior-based marketing automations for Harmomus.
-- Safe additive migration: creates the automation engine tables without changing existing campaign/queue behavior.

create extension if not exists pgcrypto;

-- Existing table in the project, kept here only to guarantee the extra columns/indexes needed by automations.
alter table if exists public.marketing_events
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists campaign_id uuid references public.communication_campaigns(id) on delete set null,
  add column if not exists event_key text,
  add column if not exists event_type text,
  add column if not exists event_label text,
  add column if not exists action text,
  add column if not exists channel text,
  add column if not exists source text default 'harmomus',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists marketing_events_user_key_created_at_idx
  on public.marketing_events (user_id, event_key, created_at desc)
  where user_id is not null;

create index if not exists marketing_events_key_created_at_idx
  on public.marketing_events (event_key, created_at desc);

create index if not exists marketing_events_metadata_gin_idx
  on public.marketing_events using gin (metadata);

-- 1) Automation rules configured by the admin.
create table if not exists public.marketing_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_event text not null,
  intent text not null,
  priority integer not null default 100,
  score_weight integer not null default 1,
  score_threshold integer not null default 8,
  lookback_hours integer not null default 168,
  cooldown_hours integer not null default 72,
  channel text not null default 'whatsapp',
  status text not null default 'draft',
  message_template text not null,
  cta_url text,
  audience_rule jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_automations_channel_check check (channel in ('whatsapp', 'email')),
  constraint marketing_automations_status_check check (status in ('draft', 'active', 'paused', 'archived')),
  constraint marketing_automations_priority_check check (priority >= 1),
  constraint marketing_automations_score_threshold_check check (score_threshold >= 1),
  constraint marketing_automations_cooldown_hours_check check (cooldown_hours >= 0),
  constraint marketing_automations_lookback_hours_check check (lookback_hours >= 1)
);

create index if not exists marketing_automations_status_priority_idx
  on public.marketing_automations (status, priority asc, created_at desc);

create index if not exists marketing_automations_trigger_event_idx
  on public.marketing_automations (trigger_event, status);

create index if not exists marketing_automations_intent_idx
  on public.marketing_automations (intent, status);

-- 2) Commercial state of each lead/user. This prevents spam and stores dominant intent.
create table if not exists public.user_marketing_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  current_score integer not null default 0,
  dominant_intent text,
  dominant_automation_id uuid references public.marketing_automations(id) on delete set null,
  last_event_key text,
  last_event_at timestamptz,
  last_campaign_id uuid references public.communication_campaigns(id) on delete set null,
  last_automation_id uuid references public.marketing_automations(id) on delete set null,
  last_campaign_type text,
  last_campaign_sent_at timestamptz,
  last_whatsapp_sent_at timestamptz,
  last_email_sent_at timestamptz,
  cooldown_until timestamptz,
  suppressed_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_marketing_state_dominant_intent_idx
  on public.user_marketing_state (dominant_intent, updated_at desc);

create index if not exists user_marketing_state_cooldown_until_idx
  on public.user_marketing_state (cooldown_until)
  where cooldown_until is not null;

create index if not exists user_marketing_state_score_idx
  on public.user_marketing_state (current_score desc, updated_at desc);

-- 3) Automation execution log. Stores both sends and skips for auditability.
create table if not exists public.marketing_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.marketing_automations(id) on delete set null,
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  queue_id uuid references public.communication_queue(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  trigger_event_id uuid references public.marketing_events(id) on delete set null,
  trigger_event_key text,
  intent text,
  channel text not null default 'whatsapp',
  score integer not null default 0,
  status text not null default 'pending',
  scheduled_at timestamptz,
  processed_at timestamptz,
  sent_at timestamptz,
  skipped_reason text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_automation_runs_channel_check check (channel in ('whatsapp', 'email')),
  constraint marketing_automation_runs_status_check check (status in ('pending', 'queued', 'sent', 'skipped', 'failed', 'canceled'))
);

create index if not exists marketing_automation_runs_user_created_at_idx
  on public.marketing_automation_runs (user_id, created_at desc);

create index if not exists marketing_automation_runs_automation_status_idx
  on public.marketing_automation_runs (automation_id, status, created_at desc);

create index if not exists marketing_automation_runs_status_scheduled_at_idx
  on public.marketing_automation_runs (status, scheduled_at nulls first, created_at desc);

create index if not exists marketing_automation_runs_trigger_event_idx
  on public.marketing_automation_runs (trigger_event_key, created_at desc);

-- Avoid duplicate active/pending automation jobs for the same user and automation.
create unique index if not exists marketing_automation_runs_unique_active_user_automation_idx
  on public.marketing_automation_runs (automation_id, user_id)
  where status in ('pending', 'queued');

-- 4) Seed initial automation rules. They stay as draft so the admin can review before enabling.
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
values
  (
    'Free/Plus tentou acessar recurso Premium',
    'Dispara quando o usuário acumula bloqueios de recursos pagos em até 7 dias.',
    'premium_blocked',
    'upgrade_premium',
    30,
    3,
    8,
    168,
    168,
    'whatsapp',
    'draft',
    'Oi, {{nome}}! Vi que você tentou acessar recursos que ainda estão bloqueados no seu plano. Hoje você pode liberar os kits Premium e estudar sem travar no meio do processo: {{link}}',
    '/assinar?plano=premium&utm_source=automation&utm_campaign=premium_blocked',
    '{"plans":["free","plus"],"min_blocks":3}'::jsonb,
    '{"category":"upgrade","recommended_delay_minutes":30}'::jsonb
  ),
  (
    'Checkout iniciado e não finalizado',
    'Recupera usuários que demonstraram intenção forte de compra, mas não concluíram.',
    'checkout_started',
    'checkout_abandoned',
    20,
    10,
    10,
    48,
    48,
    'whatsapp',
    'draft',
    'Oi, {{nome}}! Percebi que você iniciou seu upgrade no Harmomus, mas não finalizou. Seu acesso aos recursos pagos ainda está reservado por aqui: {{link}}',
    '/assinar?utm_source=automation&utm_campaign=checkout_abandoned',
    '{"exclude_events":["checkout_completed","subscription_created"],"window_hours":24}'::jsonb,
    '{"category":"recovery","recommended_delay_minutes":60}'::jsonb
  ),
  (
    'Pagamento falhou',
    'Comunicação operacional para regularizar assinatura com falha de pagamento.',
    'payment_failed',
    'payment_recovery',
    10,
    15,
    15,
    72,
    48,
    'whatsapp',
    'draft',
    'Oi, {{nome}}! Seu pagamento do Harmomus não foi confirmado. Para evitar bloqueio no acesso aos kits, regularize por aqui: {{link}}',
    '/conta/assinatura?utm_source=automation&utm_campaign=payment_failed',
    '{"statuses":["past_due","payment_failed","open"]}'::jsonb,
    '{"category":"billing","recommended_delay_minutes":15}'::jsonb
  ),
  (
    'Usuário ativo ainda Free',
    'Nutrição comercial para usuários Free que consumiram conteúdo recentemente.',
    'audio_played',
    'free_active_upgrade',
    60,
    2,
    8,
    168,
    120,
    'whatsapp',
    'draft',
    'Oi, {{nome}}! Você já está usando o Harmomus. Com o upgrade, você libera mais kits, tons e recursos para estudar melhor: {{link}}',
    '/assinar?utm_source=automation&utm_campaign=free_active',
    '{"plans":["free"],"min_plays":4}'::jsonb,
    '{"category":"upgrade","recommended_delay_minutes":180}'::jsonb
  ),
  (
    'Plus engajado para Premium',
    'Oferta de expansão para assinantes Plus com consumo relevante.',
    'audio_played',
    'plus_to_premium',
    50,
    2,
    10,
    168,
    168,
    'whatsapp',
    'draft',
    'Oi, {{nome}}! Você está usando bastante o Harmomus no Plus. O Premium libera a experiência completa para estudar sem limites: {{link}}',
    '/assinar?plano=premium&utm_source=automation&utm_campaign=plus_to_premium',
    '{"plans":["plus"],"min_plays":5}'::jsonb,
    '{"category":"expansion","recommended_delay_minutes":240}'::jsonb
  )
on conflict do nothing;

-- 5) RLS policies: only admins/owners can manage automation rules and audit runs.
alter table public.marketing_automations enable row level security;
alter table public.user_marketing_state enable row level security;
alter table public.marketing_automation_runs enable row level security;

drop policy if exists "Admins can manage marketing automations" on public.marketing_automations;
create policy "Admins can manage marketing automations"
  on public.marketing_automations
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

drop policy if exists "Admins can manage user marketing state" on public.user_marketing_state;
create policy "Admins can manage user marketing state"
  on public.user_marketing_state
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

drop policy if exists "Admins can manage marketing automation runs" on public.marketing_automation_runs;
create policy "Admins can manage marketing automation runs"
  on public.marketing_automation_runs
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'owner')
    )
  );

-- Service role bypasses RLS, so API/server automation processors can still write safely via createSupabaseAdminClient().