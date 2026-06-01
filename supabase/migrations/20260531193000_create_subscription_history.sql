create table if not exists public.subscription_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  from_plan_id uuid references public.plans(id) on delete set null,
  to_plan_id uuid references public.plans(id) on delete set null,
  from_plan_slug text,
  to_plan_slug text,
  change_type text not null check (change_type in ('upgrade', 'downgrade', 'change', 'created', 'canceled', 'renewed', 'payment_failed')),
  source text not null default 'system',
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists subscription_history_user_id_created_at_idx
  on public.subscription_history (user_id, created_at desc);

create index if not exists subscription_history_subscription_id_created_at_idx
  on public.subscription_history (subscription_id, created_at desc);

create index if not exists subscription_history_change_type_created_at_idx
  on public.subscription_history (change_type, created_at desc);

create unique index if not exists subscription_history_provider_event_unique_idx
  on public.subscription_history (provider_event_id)
  where provider_event_id is not null;

alter table public.subscription_history enable row level security;

drop policy if exists "Admins can manage subscription history" on public.subscription_history;
create policy "Admins can manage subscription history"
  on public.subscription_history
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

drop policy if exists "Users can read own subscription history" on public.subscription_history;
create policy "Users can read own subscription history"
  on public.subscription_history
  for select
  using (user_id = auth.uid());
