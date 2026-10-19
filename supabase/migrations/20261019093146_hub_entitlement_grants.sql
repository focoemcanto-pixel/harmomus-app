-- Premium granted by the Foco em Canto HUB (e.g. BLACK FOCO 2026), kept as an origin independent
-- from Stripe/Asaas subscriptions: billing never reads or writes these rows, and a HUB refund only
-- revokes its own row. Effective access = any active subscription OR any active HUB grant.
create table if not exists public.hub_entitlement_grants(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 plan_slug text not null check (plan_slug in ('premium')),
 source text not null check (source ~ '^[a-z0-9_]{3,40}$'),
 source_ref text not null check (length(source_ref) <= 120),
 hub_profile_id uuid,
 status text not null default 'active' check (status in ('active','revoked')),
 starts_at timestamptz not null,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (source, source_ref, user_id),
 check (expires_at is null or expires_at > starts_at)
);
create index if not exists hub_entitlement_grants_user on public.hub_entitlement_grants(user_id, status);
alter table public.hub_entitlement_grants enable row level security;
revoke all on public.hub_entitlement_grants from anon, authenticated;
grant select, insert, update, delete on public.hub_entitlement_grants to service_role;

-- Stable HUB ↔ Harmomus identity link (one HUB profile ↔ one Harmomus account).
create table if not exists public.hub_identity_links(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 hub_profile_id uuid not null unique,
 email text not null,
 linked_at timestamptz not null default now()
);
alter table public.hub_identity_links enable row level security;
revoke all on public.hub_identity_links from anon, authenticated;
grant select, insert, update, delete on public.hub_identity_links to service_role;
-- Rollback: drop table public.hub_identity_links; drop table public.hub_entitlement_grants;
