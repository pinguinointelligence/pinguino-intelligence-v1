-- 0030_user_machine_preference.sql
-- PINGÜINO UI/UX master — Home machine preference (§8.6, §23.1 UserMachinePreference).
-- FILE-FIRST: COMMITTED, NOT APPLIED. The owner applies it to staging first; never to
-- production riwipywgqobrulyzrzad without the §23.4 checklist. Additive only — creates ONE new
-- table, touches no existing table, deletes nothing.
--
-- §23.4 guarantees:
--   * additive, no data deletion, no ALTER of existing tables;
--   * NULLABLE FALLBACK for older accounts = simply NO ROW here (one row per user).
--     NO seed/backfill: existing users are NEVER assigned a machine — they see the
--     one-time onboarding on their next Home visit and lose nothing;
--   * owner-scoped RLS by auth.uid() (never email); no grants to anon;
--   * rollback = drop the table (it holds only re-creatable preferences, no recipe data).
--
-- Batch honesty (owner correction 2026-07-17 — universal Home safety margin): default_batch
-- stores EITHER the DERIVED „Zalecany wsad PINGÜINO" grams with full provenance (source-of-truth
-- field, safety factor applied or null, rule version, estimated flag) OR none. The versioned
-- 0.95 safety-factor rule is the ONLY ml→g arithmetic that can have produced the grams; this
-- schema itself never converts anything.

create table if not exists public.user_machine_preference (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  -- EITHER a catalog record id (per model + market) OR a user-declared custom profile.
  machine_profile_id text,
  custom_profile jsonb,
  check (
    (machine_profile_id is not null and custom_profile is null)
    or (machine_profile_id is null and custom_profile is not null)
  ),
  -- §8.6: region, resolved technology and the EXISTING visible mode (lockstep with the
  -- HomeSupportedTechnology / HomeVisibleModeId unions — continuous_soft_serve has no Home mode).
  market text not null check (length(market) > 0),
  resolved_technology text not null
    check (resolved_technology in ('respin', 'respin_soft', 'compressor', 'frozen_bowl')),
  resolved_visible_mode text not null
    check (resolved_visible_mode in ('fresh', 'ninja_gelato', 'ninja_swirl')),
  -- Verbatim §9.1 facts at save time (nulls preserved, never guessed).
  capacity_snapshot jsonb not null,
  -- {kind:'grams', grams, source, safetyFactorApplied, ruleVersion, estimated} | {kind:'none'}
  -- — see SavedDefaultBatch (owner correction 2026-07-17).
  default_batch jsonb not null
    check (default_batch->>'kind' in ('grams', 'none')),
  -- Exact machine-catalog data version the selection was made against (§10.1 configVersion).
  catalog_version text not null check (length(catalog_version) > 0),
  set_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.user_machine_preference enable row level security;

-- Owner-scoped RLS: the signed-in user manages ONLY their own preference row.
create policy user_machine_preference_select_own on public.user_machine_preference
  for select using (auth.uid() = user_id);
create policy user_machine_preference_insert_own on public.user_machine_preference
  for insert with check (auth.uid() = user_id);
create policy user_machine_preference_update_own on public.user_machine_preference
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_machine_preference_delete_own on public.user_machine_preference
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_machine_preference to authenticated;

-- No grants to anon (anonymous sessions use the device-local store). No default machine is
-- ever seeded for existing users (§23.4 "nie ustawiaj istniejącym użytkownikom losowej maszyny").
