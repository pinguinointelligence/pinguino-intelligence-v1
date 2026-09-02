-- ============================================================================
-- Migration 0016 — partner_applications, partners, partner_codes (§14.6–§14.8)
-- ============================================================================
-- The partner identity spine. Application → review → approved partner →
-- referral codes. Approval NEVER creates Stripe objects (locked decision 8);
-- Connect onboarding is a separate, later step tracked on the partner row.
--
-- Writes: service-role only (application submit/review flows are
-- Edge-Function mediated so state transitions + audit rows stay atomic).
-- Clients read their OWN application/partner/codes rows.

-- ── partner_applications ─────────────────────────────────────────────────────
-- State machine (§14.6):
--   draft → submitted → under_review → approved | rejected
--   approved → suspended → terminated   (post-approval lifecycle mirror)
create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  status text not null default 'draft' check (status in
    ('draft', 'submitted', 'under_review', 'approved', 'rejected',
     'suspended', 'terminated')),

  -- applicant-supplied profile (channels, audience, country…) — jsonb so the
  -- form can evolve without migrations; validated server-side on submit
  application_data jsonb not null default '{}'::jsonb,

  submitted_at timestamptz,
  reviewed_at timestamptz,
  -- reviewer actor as text ('system' or admin uuid) — audit_log has the trail
  reviewed_by text,
  decision_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §14.6: at most ONE in-flight (non-terminal) application per user; a
-- rejected user may re-apply with a NEW row, so history is preserved
create unique index if not exists partner_applications_open_uniq
  on public.partner_applications (user_id)
  where status in ('draft', 'submitted', 'under_review');

create index if not exists partner_applications_status_idx
  on public.partner_applications (status);

drop trigger if exists partner_applications_touch on public.partner_applications;
create trigger partner_applications_touch
  before update on public.partner_applications
  for each row execute function public.touch_updated_at();

-- ── partners ─────────────────────────────────────────────────────────────────
-- The immutable partner identity: `id` is never reused or reassigned — the
-- commission ledger, payouts and codes all hang off it, so financial history
-- stays coherent even if the partner is terminated.
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  -- NO cascade: a partner row anchors financial history (ledger/payouts).
  -- Deleting the auth user is intentionally blocked while this row exists —
  -- offboarding is a documented manual process (ROLLBACK_PLAN.md), never a
  -- silent cascade that would orphan money.
  user_id uuid not null unique references auth.users (id),
  application_id uuid references public.partner_applications (id),

  status text not null default 'active'
    check (status in ('active', 'suspended', 'terminated')),

  -- CONVENIENCE mirror of the current tier — the authoritative monthly tier
  -- history lives in partner_tier_snapshots (0018)
  tier text not null default 'standard'
    check (tier in ('standard', 'gold', 'elite')),

  -- Stripe Connect (decision 10): hosted onboarding, transfers-only account
  stripe_connect_account_id text unique,
  onboarding_complete boolean not null default false,
  payouts_enabled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partners_status_idx on public.partners (status);

drop trigger if exists partners_touch on public.partners;
create trigger partners_touch
  before update on public.partners
  for each row execute function public.touch_updated_at();

-- ── partner_codes ────────────────────────────────────────────────────────────
-- Referral codes/slugs. A retired code stays in the table forever (clicks and
-- attributions reference it); `replacement_code_id` links a retired code to
-- its successor so old links can be honoured or redirected.
create table if not exists public.partner_codes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),

  -- canonical (display) code + URL slug; normalisation (case/trim) is applied
  -- server-side BEFORE insert — the DB stores only canonical forms
  code text not null check (code <> ''),
  slug text not null check (slug <> '' and slug = lower(slug)),

  status text not null default 'active'
    check (status in ('active', 'retired', 'blocked')),
  replacement_code_id uuid references public.partner_codes (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- §14.8/§14.14: codes and slugs are unique AMONG ACTIVE codes only — a
-- retired code's text may be reissued later, but two live owners can never
-- claim the same code/slug at once
create unique index if not exists partner_codes_code_active_uniq
  on public.partner_codes (code) where status = 'active';
create unique index if not exists partner_codes_slug_active_uniq
  on public.partner_codes (slug) where status = 'active';

create index if not exists partner_codes_partner_idx
  on public.partner_codes (partner_id);

drop trigger if exists partner_codes_touch on public.partner_codes;
create trigger partner_codes_touch
  before update on public.partner_codes
  for each row execute function public.touch_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.partner_applications enable row level security;
alter table public.partners enable row level security;
alter table public.partner_codes enable row level security;

-- applications are readable by their owner (form re-entry, status display)
create policy partner_applications_select_own on public.partner_applications
  for select using (auth.uid() = user_id);

-- a partner reads their own partner row
create policy partners_select_own on public.partners
  for select using (auth.uid() = user_id);

-- a partner reads their own codes (join through their own partner row; the
-- subquery runs under the caller's own RLS — no privileged helper)
create policy partner_codes_select_own on public.partner_codes
  for select using (
    exists (
      select 1 from public.partners p
      where p.id = partner_id and p.user_id = auth.uid()
    )
  );

-- ── Grants: SELECT only — all writes are service-role mediated ──────────────
grant select on public.partner_applications to authenticated;
grant select on public.partners to authenticated;
grant select on public.partner_codes to authenticated;
-- intentionally NO insert/update/delete grants to anon or authenticated:
-- self-approving an application or minting codes client-side must be
-- impossible at the DB layer, not just the UI layer.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- flags-off first (partner program disabled = no new applications/codes).
-- partners/partner_codes anchor the commission ledger: NEVER dropped in
-- production once a commission_entry exists. Dev/sandbox only:
--   drop table if exists public.partner_codes;
--   drop table if exists public.partners;
--   drop table if exists public.partner_applications;
-- ============================================================================
