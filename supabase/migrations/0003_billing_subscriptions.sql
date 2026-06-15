-- Phase 2B.1 — billing/subscription tables with read-own RLS.
--
-- Source of truth for "is this user Pro?" is Stripe; these tables are a
-- server-maintained cache. In 2B.1 there is NO writer yet — the Stripe webhook
-- Edge Function (server-only, privileged) will write these in 2B.3. Users can
-- READ only their own rows and can NEVER write billing state from the frontend
-- (no insert/update/delete policy or grant), so no one can self-promote to Pro.
-- No billing secrets are stored here; no privileged-server-role dependency.

-- ── billing_customers: maps a user to their Stripe customer ──────────────────
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

-- ── subscriptions: server-maintained cache of Stripe subscription state ──────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  subscription_status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);

-- keep updated_at fresh (reuses the function from migration 0001)
drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security: read-own only, no public access ──────────────────────
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;

create policy billing_customers_select_own on public.billing_customers
  for select using (auth.uid() = user_id);

create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

-- ── Grants: read for authenticated; NO write (writes happen server-side only) ─
grant usage on schema public to anon, authenticated;
grant select on public.billing_customers to authenticated;
grant select on public.subscriptions to authenticated;
-- intentionally NO insert/update/delete grants to anon or authenticated.
