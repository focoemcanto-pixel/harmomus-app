create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists phone text,
  add column if not exists whatsapp_opt_in boolean not null default true,
  add column if not exists email_opt_in boolean not null default true,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists origin text,
  add column if not exists utm_source text,
  add column if not exists utm_campaign text;

update public.profiles set phone = coalesce(phone, '+5500000000000') where phone is null;
alter table public.profiles alter column phone set not null;

create table if not exists public.marketing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'login','signup','checkout_started','checkout_abandoned','subscription_created','subscription_canceled',
    'playlist_created','kit_downloaded','favorite_added','email_open','whatsapp_click'
  )),
  channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketing_events_user_id on public.marketing_events(user_id);
create index if not exists idx_marketing_events_event_type on public.marketing_events(event_type);
create index if not exists idx_marketing_events_created_at on public.marketing_events(created_at desc);

create table if not exists public.communication_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('labmessage','evolution_api','z_api','meta_cloud_api')),
  instance_name text not null,
  status text not null default 'disconnected' check (status in ('connected','disconnected','pending_qr','error')),
  connected_number text,
  qr_code text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('onboarding','recuperacao','promocao','renovacao','abandono')),
  channel text not null check (channel in ('whatsapp','email')),
  subject text,
  content text not null,
  variables jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null check (channel in ('whatsapp','email')),
  audience_type text not null,
  segment_slug text,
  message text not null,
  preview_payload jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','processing','completed','canceled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.communication_campaigns(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('whatsapp','email')),
  status text not null check (status in ('enviado','entregue','falhou','clicou','abriu','respondeu')),
  provider_message_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.automation_flows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_event text not null,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
