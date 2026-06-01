create table if not exists communication_whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text not null check (type in ('whatsapp','email','webhook')),
  provider text not null default 'custom',
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  created_by uuid null
);

create table if not exists communication_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  channel text not null check (channel in ('whatsapp','email','both')),
  category text null,
  subject text null,
  body text not null,
  media_url text null,
  variables text[] not null default array['nome','email','plano','link'],
  active boolean not null default true,
  created_by uuid null
);

create table if not exists communication_assets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  file_name text not null,
  file_type text null,
  file_size bigint null,
  storage_path text null,
  public_url text not null,
  purpose text null default 'campaign',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null
);

create table if not exists communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','queued','sending','sent','paused','canceled','failed')),
  channels text[] not null default '{}'::text[],
  audience_filters jsonb not null default '{}'::jsonb,
  title text null,
  message text not null,
  link_url text null,
  media_id uuid null references communication_assets(id) on delete set null,
  schedule_mode text not null default 'now' check (schedule_mode in ('now','scheduled')),
  scheduled_at timestamptz null,
  rate_limits jsonb not null default '{}'::jsonb,
  test_payload jsonb null,
  stats jsonb not null default '{"sent":0,"failed":0,"queued":0,"clicked":0,"opened":0}'::jsonb,
  created_by uuid null
);

create table if not exists communication_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references communication_campaigns(id) on delete cascade,
  user_id uuid null,
  recipient_name text null,
  recipient_email text null,
  recipient_phone text null,
  channel text not null check (channel in ('whatsapp','email')),
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','skipped','canceled')),
  scheduled_at timestamptz null,
  sent_at timestamptz null,
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  response jsonb null,
  error_message text null
);

create table if not exists communication_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid null references communication_campaigns(id) on delete set null,
  job_id uuid null references communication_queue(id) on delete set null,
  channel text null,
  event text not null,
  level text not null default 'info' check (level in ('debug','info','warning','error')),
  message text not null,
  payload jsonb null,
  response jsonb null
);

create index if not exists communication_campaigns_status_idx on communication_campaigns(status);
create index if not exists communication_queue_campaign_status_idx on communication_queue(campaign_id, status);
create index if not exists communication_logs_campaign_idx on communication_logs(campaign_id, created_at desc);
create index if not exists communication_whatsapp_integrations_type_active_idx on communication_whatsapp_integrations(type, active);
