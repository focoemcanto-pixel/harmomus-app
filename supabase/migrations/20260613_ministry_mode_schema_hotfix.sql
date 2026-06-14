create extension if not exists "pgcrypto";

create table if not exists public.ministry_team_templates (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  name text not null,
  description text,
  coordinator_member_id uuid references public.ministry_members(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ministry_team_template_members (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.ministry_team_templates(id) on delete cascade,
  member_id uuid not null references public.ministry_members(id) on delete cascade,
  assigned_voice text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, member_id)
);

alter table public.ministry_team_template_members
  add column if not exists assigned_voice text;

alter table public.ministry_team_template_members
  add column if not exists notes text;

alter table public.ministry_team_template_members
  add column if not exists assigned_role text;

alter table public.ministry_team_template_members
  add column if not exists assigned_tone text;

alter table public.ministry_repertoires
  add column if not exists coordinator_member_id uuid references public.ministry_members(id) on delete set null;

alter table public.ministry_repertoires
  add column if not exists team_template_id uuid references public.ministry_team_templates(id) on delete set null;

alter table public.ministry_repertoires
  add column if not exists status text not null default 'draft';

alter table public.ministry_repertoires
  add column if not exists general_notes text;

alter table public.ministry_repertoire_items
  add column if not exists key_override text;

alter table public.ministry_repertoire_items
  add column if not exists notes text;

alter table public.ministry_repertoire_assignments
  alter column repertoire_item_id drop not null;

alter table public.ministry_repertoire_assignments
  add column if not exists assigned_role text;

alter table public.ministry_repertoire_assignments
  add column if not exists assigned_voice text;

alter table public.ministry_repertoire_assignments
  add column if not exists assigned_tone text;

alter table public.ministry_repertoire_assignments
  add column if not exists study_mode text not null default 'voice';

alter table public.ministry_repertoire_assignments
  add column if not exists notes text;

alter table public.ministry_repertoire_assignments
  add column if not exists song_member_notes text;

create table if not exists public.ministry_calendar_events (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  repertoire_id uuid references public.ministry_repertoires(id) on delete set null,
  team_template_id uuid references public.ministry_team_templates(id) on delete set null,
  coordinator_member_id uuid references public.ministry_members(id) on delete set null,
  title text not null,
  event_date date not null,
  status text not null default 'scheduled',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ministry_team_templates_ministry_idx on public.ministry_team_templates(ministry_id, archived);
create index if not exists ministry_team_template_members_template_idx on public.ministry_team_template_members(template_id);
create index if not exists ministry_team_template_members_member_idx on public.ministry_team_template_members(member_id);
create index if not exists ministry_repertoires_coordinator_idx on public.ministry_repertoires(coordinator_member_id);
create index if not exists ministry_repertoires_template_idx on public.ministry_repertoires(team_template_id);
create index if not exists ministry_repertoire_assignments_item_member_idx on public.ministry_repertoire_assignments(repertoire_item_id, member_id);
create unique index if not exists ministry_repertoire_assignments_unique_member_scale
  on public.ministry_repertoire_assignments(repertoire_id, member_id)
  where repertoire_item_id is null;
create index if not exists ministry_calendar_events_ministry_date_idx on public.ministry_calendar_events(ministry_id, event_date);

alter table public.ministry_team_templates enable row level security;
alter table public.ministry_team_template_members enable row level security;
alter table public.ministry_calendar_events enable row level security;

notify pgrst, 'reload schema';
