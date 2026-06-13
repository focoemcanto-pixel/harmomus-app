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
  assigned_role text,
  assigned_voice text,
  assigned_tone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, member_id)
);

alter table public.ministry_team_template_members
  drop constraint if exists ministry_team_template_members_voice_check;

alter table public.ministry_team_template_members
  add constraint ministry_team_template_members_voice_check
  check (
    assigned_voice is null
    or assigned_voice in ('todos','lead','tenor','contralto','soprano','baritono','baixo','instrumento','outro')
  );

alter table public.ministry_repertoires
  add column if not exists coordinator_member_id uuid references public.ministry_members(id) on delete set null;

alter table public.ministry_repertoires
  add column if not exists team_template_id uuid references public.ministry_team_templates(id) on delete set null;

alter table public.ministry_repertoires
  add column if not exists status text not null default 'draft';

alter table public.ministry_repertoires
  add column if not exists general_notes text;

alter table public.ministry_repertoire_assignments
  add column if not exists assigned_role text;

alter table public.ministry_repertoire_assignments
  add column if not exists study_mode text not null default 'voice';

alter table public.ministry_repertoire_assignments
  drop constraint if exists ministry_repertoire_assignments_study_mode_check;

alter table public.ministry_repertoire_assignments
  add constraint ministry_repertoire_assignments_study_mode_check
  check (study_mode in ('voice','full_mix','instrumental','custom'));

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
create index if not exists ministry_calendar_events_ministry_date_idx on public.ministry_calendar_events(ministry_id, event_date);

alter table public.ministry_team_templates enable row level security;
alter table public.ministry_team_template_members enable row level security;
alter table public.ministry_calendar_events enable row level security;

drop policy if exists "Read own ministry team templates" on public.ministry_team_templates;
create policy "Read own ministry team templates" on public.ministry_team_templates for select using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_team_templates.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
);

drop policy if exists "Managers manage ministry team templates" on public.ministry_team_templates;
create policy "Managers manage ministry team templates" on public.ministry_team_templates for all using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_team_templates.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
) with check (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_team_templates.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
);

drop policy if exists "Read own ministry team template members" on public.ministry_team_template_members;
create policy "Read own ministry team template members" on public.ministry_team_template_members for select using (
  exists (
    select 1
    from public.ministry_team_templates mt
    join public.ministry_members mm on mm.ministry_id = mt.ministry_id
    where mt.id = ministry_team_template_members.template_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
);

drop policy if exists "Managers manage ministry team template members" on public.ministry_team_template_members;
create policy "Managers manage ministry team template members" on public.ministry_team_template_members for all using (
  exists (
    select 1
    from public.ministry_team_templates mt
    join public.ministry_members mm on mm.ministry_id = mt.ministry_id
    where mt.id = ministry_team_template_members.template_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
) with check (
  exists (
    select 1
    from public.ministry_team_templates mt
    join public.ministry_members mm on mm.ministry_id = mt.ministry_id
    where mt.id = ministry_team_template_members.template_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
);

drop policy if exists "Read own ministry calendar events" on public.ministry_calendar_events;
create policy "Read own ministry calendar events" on public.ministry_calendar_events for select using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_calendar_events.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
  )
);

drop policy if exists "Managers manage ministry calendar events" on public.ministry_calendar_events;
create policy "Managers manage ministry calendar events" on public.ministry_calendar_events for all using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_calendar_events.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
) with check (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_calendar_events.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
);

notify pgrst, 'reload schema';
