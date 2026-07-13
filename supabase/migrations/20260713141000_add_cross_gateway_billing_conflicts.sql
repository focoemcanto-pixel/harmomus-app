begin;

create table if not exists public.billing_gateway_conflicts (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  active_gateway text not null,
  incoming_gateway text not null,
  active_subscription_id uuid null references public.subscriptions(id) on delete set null,
  incoming_gateway_subscription_id text null,
  incoming_payment_id text null,
  incoming_event_id text null,
  incoming_event_type text null,
  reason text not null default 'active_subscription_owned_by_other_gateway',
  status text not null default 'open' check (status in ('open','reviewed','refunded','ignored','resolved')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create unique index if not exists billing_gateway_conflicts_dedupe_key_unique
on public.billing_gateway_conflicts (dedupe_key);

create index if not exists billing_gateway_conflicts_open_idx
on public.billing_gateway_conflicts (status, created_at desc);

alter table public.billing_gateway_conflicts enable row level security;

-- Service-role operations bypass RLS. Admin reads should happen through server-side APIs.

commit;
