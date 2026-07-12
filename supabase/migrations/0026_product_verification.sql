-- 0026_product_verification.sql
-- PI VERIFIED & MAPPER REVIEW workflow (additive, FILE-FIRST — owner applies to staging,
-- never production riwipywgqobrulyzrzad).
--
-- Adds the verification WORKFLOW tables that COMPOSE the existing product architecture. It
-- does NOT duplicate or modify: public.products (0007, keeps status/reviewed_by/reviewed_at/
-- review_notes), public.product_snapshots (0011, the reused history), the OCR evidence tables
-- (0022-0024), account-access (0025), or any Billing table. It never references mapper_basement.
--
-- LOCKED rules enforced in schema:
--   • the reviewer/senior_reviewer/review_admin ROLE is service-role granted only — a client
--     can never self-promote to a reviewer;
--   • PI Verified is NOT client-writable: verification_signoffs is INSERT by service-role only
--     (the app persists pi_verified through the existing guarded productStatusWrite path);
--   • sign-offs are IMMUTABLE (insert+select only); events / candidates / decisions / waivers /
--     notes are APPEND-ONLY (a correction is a NEW candidate row, never an edit);
--   • authorization is by auth.uid() (never email); owner-scoped RLS; no anon grants.

-- ── review_roles (the NEW reviewer capability — separate from admin/partner) ──
create table if not exists public.review_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reviewer','senior_reviewer','review_admin')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.review_roles enable row level security;
create policy review_roles_select_own on public.review_roles
  for select using (auth.uid() = user_id);
grant select on public.review_roles to authenticated;
-- NB: no client insert/update/delete — reviewer grants are service-role only.

-- ── verification_policy_versions (versioned status + required-field policy) ───
create table if not exists public.verification_policy_versions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('status','required_fields')),
  version text not null,
  active boolean not null default false,
  activated_by uuid,
  activated_at timestamptz not null default now(),
  config jsonb not null default '{}'::jsonb,
  unique (kind, version)
);
alter table public.verification_policy_versions enable row level security;
create policy verification_policy_versions_select on public.verification_policy_versions
  for select using (true);
grant select on public.verification_policy_versions to authenticated;
-- NB: policy activation is service-role only (admin flow) — no client write.

-- ── verification_cases (one per product under review) ────────────────────────
create table if not exists public.verification_cases (
  id uuid primary key default gen_random_uuid(),
  -- soft link to products (like matched_basement_id: a value, not an FK, to avoid coupling)
  product_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in
    ('ocr','csv_import','manual_entry','supplier_doc','existing_product','mapper_match','pi_calculated','pi_generated')),
  state text not null default 'draft' check (state in
    ('draft','pending_review','assigned','in_review','needs_more_evidence','blocked','ready_for_signoff','verified','rejected','reopened')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  revision integer not null default 1 check (revision >= 1),
  assigned_reviewer_id uuid,
  policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
alter table public.verification_cases enable row level security;
create index if not exists verification_cases_owner_idx on public.verification_cases (owner_user_id, state);
create index if not exists verification_cases_product_idx on public.verification_cases (product_id);
-- Owner reads + manages their own case through the review states. (Cross-owner reviewer/admin
-- reads are a service-role/Edge path — like audit_log — never a client cross-owner policy.)
create policy verification_cases_select_own on public.verification_cases
  for select using (auth.uid() = owner_user_id);
create policy verification_cases_insert_own on public.verification_cases
  for insert with check (auth.uid() = owner_user_id);
create policy verification_cases_update_own on public.verification_cases
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
grant select, insert, update on public.verification_cases to authenticated;

-- helper: does auth.uid() own the parent case?
-- (inlined per policy since Postgres RLS cannot call a SECURITY DEFINER without one)

-- ── verification_field_candidates (APPEND-ONLY source evidence) ──────────────
create table if not exists public.verification_field_candidates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  field_key text not null,
  raw_value text,
  normalized_value text,
  unit text,
  source_type text not null,
  provenance text not null check (provenance in ('explicit','calculated','inferred','manual','absent')),
  source_ref text,
  confidence integer check (confidence is null or (confidence >= 0 and confidence <= 100)),
  method text,
  created_by text not null,
  created_at timestamptz not null default now(),
  warnings text[] not null default '{}',
  red_flags text[] not null default '{}',
  active boolean not null default true,
  supersedes uuid,
  -- 'absent' candidates carry no value (unknown is never a fabricated 0)
  check (provenance <> 'absent' or (raw_value is null and normalized_value is null))
);
alter table public.verification_field_candidates enable row level security;
create index if not exists vfc_case_idx on public.verification_field_candidates (case_id, field_key);
create policy vfc_select_own on public.verification_field_candidates
  for select using (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
create policy vfc_insert_own on public.verification_field_candidates
  for insert with check (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
grant select, insert on public.verification_field_candidates to authenticated;
-- NB: no update/delete — a correction is a NEW candidate (supersedes the old id).

-- ── verification_field_decisions (APPEND-ONLY reviewer decisions) ────────────
create table if not exists public.verification_field_decisions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  field_key text not null,
  action text not null check (action in
    ('accept','reject','edit_accept','add_reviewer_candidate','mark_unknown','request_evidence','resolve_conflict','restore_previous','waive_warning','defer')),
  selected_candidate_id uuid,
  actor_id uuid not null,
  reason text,
  at timestamptz not null default now()
);
alter table public.verification_field_decisions enable row level security;
create index if not exists vfd_case_idx on public.verification_field_decisions (case_id, field_key, at);
create policy vfd_select_own on public.verification_field_decisions
  for select using (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
create policy vfd_insert_own on public.verification_field_decisions
  for insert with check (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
grant select, insert on public.verification_field_decisions to authenticated;

-- ── warning_waivers (APPEND-ONLY; authorized role + written reason) ──────────
create table if not exists public.warning_waivers (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  flag_code text not null,
  waived_by uuid not null,
  reason text not null,
  at timestamptz not null default now()
);
alter table public.warning_waivers enable row level security;
create policy warning_waivers_select_own on public.warning_waivers
  for select using (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
grant select on public.warning_waivers to authenticated;
-- NB: waiving a blocking flag is an authorized senior/admin action → service-role insert only.

-- ── review_notes (APPEND-ONLY) ───────────────────────────────────────────────
create table if not exists public.review_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  author_id uuid not null,
  note text not null,
  at timestamptz not null default now()
);
alter table public.review_notes enable row level security;
create policy review_notes_select_own on public.review_notes
  for select using (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
create policy review_notes_insert_own on public.review_notes
  for insert with check (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
grant select, insert on public.review_notes to authenticated;

-- ── verification_case_events (APPEND-ONLY audit) ─────────────────────────────
create table if not exists public.verification_case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  at timestamptz not null default now(),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  policy_version text not null,
  correlation_key text not null,
  unique (correlation_key)
);
alter table public.verification_case_events enable row level security;
create index if not exists vce_case_idx on public.verification_case_events (case_id, at desc);
create policy vce_select_own on public.verification_case_events
  for select using (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
create policy vce_insert_own on public.verification_case_events
  for insert with check (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
grant select, insert on public.verification_case_events to authenticated;
-- NB: no update/delete — audit history is never rewritten.

-- ── verification_signoffs (IMMUTABLE — the PI Verified record) ───────────────
create table if not exists public.verification_signoffs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.verification_cases(id) on delete cascade,
  revision integer not null check (revision >= 1),
  signed_by uuid not null,
  at timestamptz not null default now(),
  reason text not null,
  policy_version text not null,
  independent_provenance boolean not null,
  red_flags_clear boolean not null,
  final_fields jsonb not null default '[]'::jsonb,
  status text not null default 'pi_verified' check (status = 'pi_verified'),
  -- the four attestations must all be affirmative for a sign-off to exist
  check (independent_provenance = true and red_flags_clear = true),
  unique (case_id, revision)
);
alter table public.verification_signoffs enable row level security;
create policy verification_signoffs_select_own on public.verification_signoffs
  for select using (exists (select 1 from public.verification_cases c where c.id = case_id and c.owner_user_id = auth.uid()));
grant select on public.verification_signoffs to authenticated;
-- NB: PI Verified is NOT client-writable — INSERT is SERVICE-ROLE ONLY (the app records the
-- product's pi_verified status through the existing guarded productStatusWrite path). No
-- update/delete anywhere: a verified snapshot is immutable; reopening creates a NEW revision.

-- No grants to anon anywhere. Every table is owner-scoped by auth.uid() through its case.
