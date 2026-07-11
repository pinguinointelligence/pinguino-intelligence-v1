-- ============================================================================
-- Migration 0021 — stripe_webhook_events, audit_log (§14.16–§14.17)
-- ============================================================================
-- Durable webhook intake (locked decision 9): every verified Stripe event is
-- recorded BEFORE processing, keyed uniquely per account scope × livemode ×
-- event id, with a retryable state machine — duplicates and out-of-order
-- delivery become no-ops, and a crashed handler resumes instead of losing
-- money-moving events. Handlers re-fetch current Stripe objects; the stored
-- payload is audit/debug evidence, not processing input.
--
-- audit_log: append-only trail for every privileged mutation (grants,
-- approvals, reversals, payout runs) with actor + reason + correlation id.
--
-- Writes: service-role only. Reads: NEITHER table is client-readable —
-- webhook payloads contain other users' billing data; the audit trail is
-- operator-facing.

-- ── stripe_webhook_events ────────────────────────────────────────────────────
-- State machine: received → processing → processed
--                received|processing → failed → (retry) processing
--                failed (max attempts) → dead_letter; irrelevant → skipped
create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),

  -- platform account vs Connect application events — the same event id can
  -- legally appear in both streams, hence part of the unique key
  account_scope text not null default 'platform'
    check (account_scope in ('platform', 'connect')),
  livemode boolean not null,
  event_id text not null,
  event_type text not null,

  state text not null default 'received' check (state in
    ('received', 'processing', 'processed', 'skipped', 'failed', 'dead_letter')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,

  -- verified raw event payload (audit/debug; handlers re-fetch live objects)
  payload jsonb,

  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- §14.14: exactly-once intake — a redelivered event upserts into this row
  -- instead of creating a second processing attempt record
  constraint stripe_webhook_events_event_uniq
    unique (account_scope, livemode, event_id)
);

create index if not exists stripe_webhook_events_state_idx
  on public.stripe_webhook_events (state, received_at);
create index if not exists stripe_webhook_events_type_idx
  on public.stripe_webhook_events (event_type);

drop trigger if exists stripe_webhook_events_touch on public.stripe_webhook_events;
create trigger stripe_webhook_events_touch
  before update on public.stripe_webhook_events
  for each row execute function public.touch_updated_at();

-- ── audit_log ────────────────────────────────────────────────────────────────
-- Append-only: no updated_at, no touch trigger, no update/delete path.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),

  actor_type text not null
    check (actor_type in ('system', 'admin', 'user', 'webhook')),
  -- actor identity as text ('system:payout-job', admin uuid, event id…)
  actor_id text,

  action text not null,           -- e.g. 'entitlement.revoke', 'payout.run'
  entity_type text not null,      -- e.g. 'entitlements', 'partner_payouts'
  entity_id text,
  diff jsonb,                     -- before/after or the applied change
  reason text,
  -- ties multi-row operations together (one payout run, one webhook event)
  correlation_id text,

  created_at timestamptz not null default now()
);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_correlation_idx
  on public.audit_log (correlation_id);
create index if not exists audit_log_created_idx
  on public.audit_log (created_at desc);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.stripe_webhook_events enable row level security;
alter table public.audit_log enable row level security;

-- NO policies ON PURPOSE (see header): with RLS enabled and no policy,
-- clients can neither read nor write; only the service role touches these.

-- ── Grants: none ─────────────────────────────────────────────────────────────
-- intentionally NO grants to anon or authenticated at all.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- disable the webhook endpoint in Stripe FIRST (events then queue on
-- Stripe's side and can be replayed later — nothing is lost). Both tables
-- are audit history: NEVER deleted in production. Dev/sandbox only:
--   drop table if exists public.audit_log;
--   drop table if exists public.stripe_webhook_events;
-- ============================================================================
