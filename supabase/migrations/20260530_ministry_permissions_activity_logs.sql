-- Simple ministerial permissions and richer activity history.

alter table public.ministry_members drop constraint if exists ministry_members_role_check;
alter table public.ministry_members
  add constraint ministry_members_role_check check (role in ('owner','admin','manager','member'));

alter table public.ministry_invites drop constraint if exists ministry_invites_role_check;
alter table public.ministry_invites
  add constraint ministry_invites_role_check check (role in ('admin','manager','member'));

create table if not exists public.ministry_activity_logs (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references public.ministries(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  action text not null,
  entity_type text,
  entity_id uuid,
  description text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table public.ministry_activity_logs
  add column if not exists actor_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists actor_name text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists description text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamptz default now();

update public.ministry_activity_logs
set description = coalesce(description, action, 'Ação ministerial')
where description is null;

alter table public.ministry_activity_logs
  alter column description set not null,
  alter column metadata set default '{}'::jsonb,
  alter column created_at set default now();

create index if not exists idx_ministry_activity_logs_ministry_created on public.ministry_activity_logs(ministry_id, created_at desc);
create index if not exists idx_ministry_activity_logs_actor_user_id on public.ministry_activity_logs(actor_user_id);
create index if not exists idx_ministry_activity_logs_action on public.ministry_activity_logs(action);

alter table public.ministry_activity_logs enable row level security;

drop policy if exists "Members can read ministry logs" on public.ministry_activity_logs;
create policy "Managers can read ministry logs" on public.ministry_activity_logs
for select using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_activity_logs.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
);

-- Keep RLS compatible with legacy manager rows while allowing the new admin role.
drop policy if exists "Managers can manage ministry members" on public.ministry_members;
create policy "Managers can manage ministry members"
on public.ministry_members for all using (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_members.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
) with check (
  exists (
    select 1 from public.ministry_members mm
    where mm.ministry_id = ministry_members.ministry_id
      and mm.user_id = auth.uid()
      and mm.status = 'active'
      and mm.role in ('owner','admin','manager')
  )
);

notify pgrst, 'reload schema';
