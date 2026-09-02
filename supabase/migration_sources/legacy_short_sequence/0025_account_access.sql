-- 0025_account_access.sql
-- ACCOUNT ACCESS spine (additive, FILE-FIRST — committed + guard-tested; the OWNER applies
-- it to a real staging DB; never applied to production riwipywgqobrulyzrzad here).
--
-- Adds the identity/profile/session/device/security tables that the Account Access layer
-- needs. It does NOT duplicate or modify existing tables:
--   • 0001 public.profiles stays the minimal auth-linked profile; account_profiles EXTENDS
--     it 1:1 (richer, optional fields) — it never replaces it;
--   • 0015 public.entitlements remains the entitlement source of truth (Billing-owned);
--     Account Access READS it, never rewrites it — no entitlement table is created here;
--   • 0016 public.partners / partner_applications stay the partner identity — not touched.
--
-- LOCKED principles enforced in schema:
--   • the authenticated internal user id (auth.uid()) is the authorization identity — no
--     table authorizes by email;
--   • admin status (admin_users) and partner status (0016 partners) are SEPARATE;
--   • ONE active interactive session per user — a partial unique index makes a second
--     active session impossible at the DB layer;
--   • account_security_events is APPEND-ONLY (select + insert only, no update/delete);
--   • privileged transitions (account_states, admin_users, account_provider_links) are
--     service-role only — no client can self-promote or self-restore.

-- ── account_profiles (1:1 extension of 0001 profiles) ───────────────────────
create table if not exists public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text,
  country text,
  timezone text,
  business_name text,
  -- account_type is a PROFILE ATTRIBUTE for display/segmentation, NOT authorization
  -- (authorization is resolved from entitlements). Kept intentionally permissive.
  account_type text not null default 'standard'
    check (account_type in ('standard', 'home', 'pro', 'franchise', 'internal')),
  notification_prefs jsonb not null default '{}'::jsonb,
  security_prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_profiles enable row level security;
create policy account_profiles_select_own on public.account_profiles
  for select using (auth.uid() = user_id);
create policy account_profiles_insert_own on public.account_profiles
  for insert with check (auth.uid() = user_id);
create policy account_profiles_update_own on public.account_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.account_profiles to authenticated;

-- ── account_states (append-only lifecycle log; latest row = current state) ───
create table if not exists public.account_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null
    check (state in ('active','pending_verification','security_locked','suspended',
                     'deletion_requested','disabled','restored')),
  reason text,
  -- who changed it (an admin's internal id or 'system'); never an email
  changed_by uuid,
  changed_at timestamptz not null default now()
);

alter table public.account_states enable row level security;
create index if not exists account_states_user_idx on public.account_states (user_id, changed_at desc);
-- Owner may READ their own state history; transitions are SERVICE-ROLE ONLY (admin flows).
create policy account_states_select_own on public.account_states
  for select using (auth.uid() = user_id);
grant select on public.account_states to authenticated;
-- NB: no insert/update/delete grant to authenticated — suspension/restore is server-only.

-- ── admin_users (admin authorization — SEPARATE from partner) ────────────────
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('support_admin','super_admin')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.admin_users enable row level security;
-- A user may READ their own admin row (to know they are admin); grants are service-role only.
create policy admin_users_select_own on public.admin_users
  for select using (auth.uid() = user_id);
grant select on public.admin_users to authenticated;
-- NB: no client insert/update/delete — no self-promotion to admin.

-- ── account_provider_links (deterministic identity linking) ──────────────────
create table if not exists public.account_provider_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('password','google','magic_link')),
  provider_account_id text not null,
  email_verified_at timestamptz,
  linked_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

alter table public.account_provider_links enable row level security;
create policy account_provider_links_select_own on public.account_provider_links
  for select using (auth.uid() = user_id);
grant select on public.account_provider_links to authenticated;
-- NB: linking is a SERVICE-ROLE op (after verified-email match) — no client write path.

-- ── registered_devices (privacy-conscious; owner-managed) ────────────────────
create table if not exists public.registered_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- app-generated random id hash — NOT invasive fingerprinting
  device_hash text not null check (device_hash ~ '^[0-9a-f]{16,64}$'),
  friendly_name text not null,
  category text not null default 'unknown'
    check (category in ('desktop','tablet','mobile','unknown')),
  browser_family text,
  os_family text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  trusted boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, device_hash)
);

alter table public.registered_devices enable row level security;
create index if not exists registered_devices_user_idx on public.registered_devices (user_id);
-- Devices are owner-managed: register (insert), rename/trust/revoke (update), forget (delete).
create policy registered_devices_select_own on public.registered_devices
  for select using (auth.uid() = user_id);
create policy registered_devices_insert_own on public.registered_devices
  for insert with check (auth.uid() = user_id);
create policy registered_devices_update_own on public.registered_devices
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy registered_devices_delete_own on public.registered_devices
  for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.registered_devices to authenticated;

-- ── app_sessions (ONE active interactive session per user) ───────────────────
create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.registered_devices(id) on delete set null,
  state text not null default 'pending'
    check (state in ('pending','active','conflicting','revoked','expired','replaced','blocked')),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  replaced_by uuid references public.app_sessions(id) on delete set null,
  -- state<>'active' unless nothing is missing; revoked implies a revoked_at
  check (state <> 'revoked' or revoked_at is not null)
);

alter table public.app_sessions enable row level security;
create index if not exists app_sessions_user_idx on public.app_sessions (user_id, state);
-- THE single-active-session invariant: at most one 'active' session per user, enforced by DB.
create unique index if not exists app_sessions_one_active_per_user
  on public.app_sessions (user_id) where (state = 'active');

create policy app_sessions_select_own on public.app_sessions
  for select using (auth.uid() = user_id);
create policy app_sessions_insert_own on public.app_sessions
  for insert with check (auth.uid() = user_id);
create policy app_sessions_update_own on public.app_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- owner may create + transition (activate/revoke) their own sessions; admin revocation is
-- a service-role path. Column-level protection is enforced in the service layer.
grant select, insert, update on public.app_sessions to authenticated;

-- ── account_security_events (APPEND-ONLY audit) ──────────────────────────────
create table if not exists public.account_security_events (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('system','admin','user','webhook')),
  actor_id uuid,
  affected_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  device_id uuid,
  session_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  reason text,
  -- idempotency / correlation — the same event is never double-recorded
  correlation_key text not null,
  unique (correlation_key)
);

alter table public.account_security_events enable row level security;
create index if not exists account_security_events_user_idx
  on public.account_security_events (affected_user_id, occurred_at desc);
-- Owner reads their own history. Append-only: SELECT + INSERT only, NO update/delete
-- policy or grant anywhere — audit history can never be rewritten by a client.
create policy account_security_events_select_own on public.account_security_events
  for select using (auth.uid() = affected_user_id);
create policy account_security_events_insert_own on public.account_security_events
  for insert with check (auth.uid() = affected_user_id);
grant select, insert on public.account_security_events to authenticated;

-- No grants to anon anywhere in this migration. Every table is owner-scoped by auth.uid();
-- privileged transitions (states/admin/provider links) are service-role only.
