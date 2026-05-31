-- Stores normalized Stripe invoice/payment data for real revenue reporting.
-- billing_events remains the raw webhook ledger; billing_invoices is the financial reporting table.

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_invoice_id text not null,
  provider_event_id text,
  user_id uuid references public.profiles(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  customer_email text,
  status text not null default 'unknown',
  currency text not null default 'brl',
  amount_due_cents integer not null default 0,
  amount_paid_cents integer not null default 0,
  amount_remaining_cents integer not null default 0,
  invoice_url text,
  hosted_invoice_url text,
  paid_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

create index if not exists idx_billing_invoices_paid_at on public.billing_invoices(paid_at desc);
create index if not exists idx_billing_invoices_user_id on public.billing_invoices(user_id);
create index if not exists idx_billing_invoices_subscription_id on public.billing_invoices(subscription_id);
create index if not exists idx_billing_invoices_status on public.billing_invoices(status);
create index if not exists idx_billing_invoices_provider_event_id on public.billing_invoices(provider_event_id);
