-- ============================================================================
-- Migration 0023 — ocr_extraction_runs, ocr_field_evidence
-- (OCR product intake spec §5, §6 — FILE-FIRST, not applied anywhere yet)
-- ============================================================================
-- The EVIDENCE layer: what the OCR engine actually read (runs, verbatim
-- full text) and every per-field candidate value with full provenance
-- (extracted raw + normalized + confidence split + review status). Locked
-- rules mirrored here:
--  * evidence is IMMUTABLE after insert — no update policy, no update grant,
--    no touch trigger, no updated_at. A re-run or a review decision is a NEW
--    row (next candidate_index), never an in-place edit; the original OCR
--    text can never be silently rewritten to match a review outcome.
--  * provenance (explicit / calculated / inferred / absent) is a first-class
--    column, NEVER collapsed into the confidence numbers.
--  * "not detected" is NEVER zero: an absent candidate carries NULL values
--    and provenance 'absent' (enforced by ocr_field_evidence_absent_shape).
--  * field_key / provenance / review_status vocabularies are EXACTLY the
--    contract unions in src/features/ocr-intake/intakeContracts.ts — the
--    lockstep guard test fails loudly on any drift.
--  * nothing here writes products, mapper_basement, PAC or POD.

-- ── ocr_extraction_runs ──────────────────────────────────────────────────────
-- One OCR engine invocation on one intake image. The verbatim full_text is
-- the original evidence for everything extracted downstream.
create table if not exists public.ocr_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ocr_intake_sessions (id) on delete cascade,
  image_id uuid not null references public.ocr_intake_images (id) on delete cascade,

  -- which provider adapter produced this (e.g. 'tesseract-local'); free text
  -- because providers are pluggable (spec §7) — never a paid-API secret
  provider_id text not null,

  -- 0..100 overall confidence as reported/derived by the adapter
  overall_confidence integer not null
    check (overall_confidence >= 0 and overall_confidence <= 100),
  duration_ms integer not null check (duration_ms >= 0),
  language_hints text[] not null default '{}',

  -- the ORIGINAL recognized text, verbatim. Immutable evidence: there is no
  -- update path to this table at all (no policy, no grant, no trigger).
  full_text text not null,

  created_at timestamptz not null default now()
);

create index if not exists ocr_extraction_runs_session_id_idx
  on public.ocr_extraction_runs (session_id);
create index if not exists ocr_extraction_runs_image_id_idx
  on public.ocr_extraction_runs (image_id);

-- ── ocr_field_evidence ───────────────────────────────────────────────────────
-- One candidate value for one contract field (spec §5). Multiple candidates
-- for the same field = a conflict the review UI must resolve explicitly.
create table if not exists public.ocr_field_evidence (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ocr_intake_sessions (id) on delete cascade,

  -- EXACTLY the contract's IntakeFieldKey union (lockstep-guarded)
  field_key text not null check (field_key in
    ('product_name', 'brand', 'package_size', 'package_unit', 'ean_code',
     'country', 'supplier', 'category', 'subcategory',
     'nutrition_basis', 'energy_kcal', 'energy_kj', 'fat', 'saturated_fat',
     'carbohydrate', 'sugars', 'protein', 'salt', 'sodium', 'fibre',
     'ingredients_text', 'allergens_text', 'may_contain_text',
     'claim_vegan', 'claim_vegetarian', 'claim_gluten_free',
     'claim_lactose_free', 'claims_other')),

  -- 0-based candidate position within (session, field)
  candidate_index integer not null check (candidate_index >= 0),

  -- verbatim extracted text (NULL when provenance = 'absent')
  extracted_raw text,
  -- deterministically normalized value, stored as text in the evidence layer
  -- (typing/units happen at the candidate-build step, not here); NULL = not
  -- normalizable or absent — NEVER a fabricated zero
  normalized_value text,

  -- where the value was read from (nullable: calculated/inferred candidates
  -- may have no single source image)
  evidence_image_id uuid references public.ocr_intake_images (id) on delete set null,
  evidence_line_index integer check
    (evidence_line_index is null or evidence_line_index >= 0),
  -- the raw text span the value was read from (verbatim, untrusted data)
  source_text text,

  -- confidence SPLIT (never collapsed): OCR read quality vs how unambiguous
  -- the deterministic normalization was; 0..100, NULL = not applicable
  extraction_confidence integer check
    (extraction_confidence is null
     or (extraction_confidence >= 0 and extraction_confidence <= 100)),
  normalization_confidence integer check
    (normalization_confidence is null
     or (normalization_confidence >= 0 and normalization_confidence <= 100)),

  provenance text not null check (provenance in
    ('explicit', 'calculated', 'inferred', 'absent')),

  review_status text not null default 'needs_confirmation' check (review_status in
    ('auto_accepted', 'needs_confirmation', 'confirmed', 'edited',
     'marked_unknown', 'conflict_unresolved')),

  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),

  -- candidate spine: one row per (session, field, candidate slot)
  constraint ocr_field_evidence_candidate_uniq
    unique (session_id, field_key, candidate_index),
  -- "not detected" is NEVER a value: absent candidates carry no raw/normalized
  constraint ocr_field_evidence_absent_shape check
    (provenance <> 'absent'
     or (extracted_raw is null and normalized_value is null))
);

create index if not exists ocr_field_evidence_session_id_idx
  on public.ocr_field_evidence (session_id);
create index if not exists ocr_field_evidence_field_key_idx
  on public.ocr_field_evidence (session_id, field_key);

-- ── Row-Level Security ───────────────────────────────────────────────────────
alter table public.ocr_extraction_runs enable row level security;
alter table public.ocr_field_evidence enable row level security;

-- owner-scoped through the parent session; NO update policy and NO delete
-- policy ON PURPOSE — evidence rows are write-once. They disappear only when
-- the owning session is deleted (FK cascade), never row-by-row: partial
-- evidence deletion would let a review outcome outlive its justification.
create policy ocr_extraction_runs_select_own on public.ocr_extraction_runs
  for select using (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy ocr_extraction_runs_insert_own on public.ocr_extraction_runs
  for insert with check (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));

create policy ocr_field_evidence_select_own on public.ocr_field_evidence
  for select using (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));
create policy ocr_field_evidence_insert_own on public.ocr_field_evidence
  for insert with check (exists (
    select 1 from public.ocr_intake_sessions s
    where s.id = session_id and s.user_id = auth.uid()));

-- ── grants (write-once: select + insert ONLY; NOTHING for anon) ─────────────
grant select, insert on table public.ocr_extraction_runs to authenticated;
grant select, insert on table public.ocr_field_evidence to authenticated;
-- note: NO update grant and NO delete grant on either table — immutability
-- is enforced at BOTH layers (missing grant AND missing policy). No anon.

-- ============================================================================
-- ROLLBACK PLAN (not applied — the paired down-migration, kept as comments)
-- ============================================================================
-- Both tables hang off 0022's sessions/images; dropping them orphans nothing:
--   drop table if exists public.ocr_field_evidence;
--   drop table if exists public.ocr_extraction_runs;
-- ============================================================================
