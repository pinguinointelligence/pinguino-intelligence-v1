-- Mapper Products — 0008: Mapper result columns for public.products.
--
-- ADDITIVE migration (Slice E). Reserves the storage columns for ONE D2
-- productMatcher result (src/data/products/productMatcher.ts -> ProductMatchResult)
-- on the GROWING public.products layer. The pure D2 matcher computes an
-- IN-MEMORY result; PERSISTING it is a LATER slice (D3 write-back). This file
-- only adds columns — NOTHING populates them in this slice.
--
-- Every new column is NULLABLE with NO DEFAULT: an unmapped product carries NULL
-- everywhere here — nothing pretends a product has already been mapped. Adding
-- nullable, default-less columns is safe on existing rows (they backfill NULL).
--
-- matched_basement_id is a PLAIN TEXT value reference to a mapper_basement
-- ingredient_id. It is deliberately NOT a foreign key: a product must be able to
-- record a (possibly stale) reference id with no structural dependency on the
-- locked reference base and no cascade. Do NOT convert it to a real FK.
--
-- NO WRITE TO THE LOCKED REFERENCE BASE: this file adds columns only — no
-- trigger, function, foreign key, or insert/update/delete — and its executable
-- SQL never names the locked reference table. The base stays locked + read-only.
--
-- The enum domains below are a deliberate SUPERSET of what the pure matcher emits:
--   * match_method adds 'manual_mapping' (a human / D3 action, never the matcher);
--   * match_confidence and mapper_status include 'rejected' (human / D3 terminal).
-- The D2 matcher stays a strict deterministic subset; no productMatcher change.
-- D3 field -> column mapping: missing_fields -> missing_fields_json; candidate_ids -> candidate_ids.
--
-- DEFERRED (NOT in this slice): calculated_profile_json and source_values_json are
-- engine / profile output (not matcher output) whose JSON shape is not locked;
-- they arrive in a later migration once D3 / engine scope is final.
--
-- The products_touch trigger (0007, reusing public.touch_updated_at from 0001)
-- still applies to updates of these columns — no trigger change is needed here.
-- RLS is unchanged: the four own-row policies (0007) are row-level on
-- owner_user_id and cover these columns automatically; no new grant is needed.
--
-- Apply in the Supabase SQL editor or via `supabase db push`. Idempotent: every
-- column uses ADD COLUMN IF NOT EXISTS. No seed, no privileged key. ProductRow /
-- products service are unchanged this slice (matched-result type alignment + the
-- D3 write-back are future work). The locked base and 0004/0005 rollback tables
-- are untouched.

alter table public.products
  add column if not exists matched_basement_id text,
  add column if not exists match_confidence text
    check (match_confidence is null or match_confidence in ('exact', 'high', 'medium', 'low', 'needs_review', 'rejected')),
  add column if not exists match_method text
    check (match_method is null or match_method in ('exact_ean', 'exact_normalized_name', 'brand_name', 'category_composition_similarity', 'ingredient_type', 'fuzzy_name', 'no_confident_match', 'manual_mapping')),
  add column if not exists mapper_status text
    check (mapper_status is null or mapper_status in ('unmatched', 'matched', 'ambiguous', 'needs_review', 'rejected')),
  add column if not exists mapper_notes text,
  add column if not exists normalized_name text,
  add column if not exists normalized_category text,
  add column if not exists needs_review_reason text,
  add column if not exists missing_fields_json jsonb,
  add column if not exists candidate_ids jsonb,
  add column if not exists candidate_count integer
    check (candidate_count is null or candidate_count >= 0);
