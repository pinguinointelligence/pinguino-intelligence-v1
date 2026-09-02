-- ============================================================================
-- Migration 0020 — invite_code_slots, invite_codes (§14.15)
-- ============================================================================
-- Owner-managed Home-trial invites: a FIXED set of stable slots (count
-- governed by INVITE_CODE_SLOT_COUNT, default 5 — seeded by ops, not
-- hardcoded here) each holding at most one open code at a time. Codes are
-- stored HASHED — the plaintext exists only at mint time and in the
-- owner-facing encrypted display copy. Redemption grants a bounded HOME
-- entitlement (source_type 'invite_home_trial', INVITE_HOME_TRIAL_DAYS) and
-- never touches Stripe (locked decision 8).
--
-- Writes: service-role only (mint/rotate/redeem Edge Functions).
-- Reads: NO client SELECT policy on either table ON PURPOSE — code
-- validation happens server-side against the hash; exposing rows (even
-- hashes + statuses) to clients would allow enumeration of open invites.

-- ── invite_code_slots ────────────────────────────────────────────────────────
create table if not exists public.invite_code_slots (
  id uuid primary key default gen_random_uuid(),
  -- stable human-facing slot identity ("slot 3") — never renumbered
  slot_number integer not null unique check (slot_number >= 1),
  enabled boolean not null default true,
  -- the slot's current open code; FK added AFTER invite_codes exists (below)
  current_code_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists invite_code_slots_touch on public.invite_code_slots;
create trigger invite_code_slots_touch
  before update on public.invite_code_slots
  for each row execute function public.touch_updated_at();

-- ── invite_codes ─────────────────────────────────────────────────────────────
-- State machine (§14.15):
--   available → reserved → sent → redeemed        (happy path)
--   available|reserved|sent → expired | revoked   (rotation/kill)
-- redeemed / expired / revoked are TERMINAL; rotation mints a new version
-- row in the same slot and links it via replacement_code_id.
create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.invite_code_slots (id),
  -- rotation counter within the slot (v1, v2, … — history stays queryable)
  version integer not null check (version >= 1),

  -- salted/peppered hash of the plaintext code (INVITE_CODE_PEPPER) — the
  -- DB never stores the plaintext; validation compares hashes server-side
  code_hash text not null unique,
  -- owner-dashboard display copy, encrypted app-side; nullable (older codes
  -- may keep hash only)
  encrypted_display text,

  status text not null default 'available' check (status in
    ('available', 'reserved', 'sent', 'redeemed', 'expired', 'revoked')),

  -- reservation/sending metadata (who the owner sent it to)
  reserved_email text,
  redeemed_by_user_id uuid references auth.users (id),
  redeemed_at timestamptz,
  -- the HOME trial entitlement created on redemption (0015)
  entitlement_id uuid references public.entitlements (id),
  -- rotation link: which code superseded this one
  replacement_code_id uuid references public.invite_codes (id),

  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invite_codes_slot_version_uniq unique (slot_id, version),
  -- a redeemed code must record who redeemed it and when
  constraint invite_codes_redeemed_shape check (
    status <> 'redeemed'
    or (redeemed_by_user_id is not null and redeemed_at is not null)
  )
);

-- §14.14: at most ONE open (non-terminal) code per slot — minting a new code
-- requires closing the previous one first (rotation is explicit, never racy)
create unique index if not exists invite_codes_slot_open_uniq
  on public.invite_codes (slot_id)
  where status in ('available', 'reserved', 'sent');

create index if not exists invite_codes_status_idx
  on public.invite_codes (status);

drop trigger if exists invite_codes_touch on public.invite_codes;
create trigger invite_codes_touch
  before update on public.invite_codes
  for each row execute function public.touch_updated_at();

-- now that invite_codes exists, close the slot → current-code loop
alter table public.invite_code_slots
  drop constraint if exists invite_code_slots_current_code_fkey;
alter table public.invite_code_slots
  add constraint invite_code_slots_current_code_fkey
  foreign key (current_code_id) references public.invite_codes (id);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.invite_code_slots enable row level security;
alter table public.invite_codes enable row level security;

-- NO policies ON PURPOSE (see header): with RLS enabled and no policy, no
-- client can read or write anything here — redemption is an Edge Function
-- that validates the presented code against code_hash under the service role.

-- ── Grants: none ─────────────────────────────────────────────────────────────
-- intentionally NO grants to anon or authenticated at all: invite inventory
-- is owner-only state and must not be enumerable from the client.

-- ============================================================================
-- ROLLBACK PLAN (not applied — see docs/billing-partner/ROLLBACK_PLAN.md):
-- flags-off first (INVITE_CODES_ENABLED=false stops mint + redeem). Redeemed
-- codes justify granted entitlements — keep them; unredeemed inventory may
-- be revoked (status flip), which is the safe "recall", not deletion.
-- Dev/sandbox only:
--   alter table public.invite_code_slots drop constraint if exists invite_code_slots_current_code_fkey;
--   drop table if exists public.invite_codes;
--   drop table if exists public.invite_code_slots;
-- ============================================================================
