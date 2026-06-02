-- Compatibility layer for Admin Communication templates and media.
-- Additive and non-destructive.

alter table if exists public.communication_templates
  add column if not exists updated_at timestamptz default now(),
  add column if not exists subject text,
  add column if not exists variables text[] default array['nome','email','plano','link'],
  add column if not exists active boolean default true,
  add column if not exists media_url text;

update public.communication_templates
set
  updated_at = coalesce(updated_at, created_at, now()),
  subject = coalesce(subject, name),
  variables = coalesce(variables, array['nome','email','plano','link']),
  active = coalesce(active, not coalesce(is_system, false)),
  media_url = coalesce(media_url, thumbnail_url)
where updated_at is null
   or subject is null
   or variables is null
   or active is null
   or media_url is null;

alter table if exists public.communication_assets
  add column if not exists updated_at timestamptz default now();

update public.communication_assets
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;
