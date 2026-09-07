-- MAPPER VERIFICATION STATUS — three values the whitelist had not caught up with.
--
-- WHY. `mapper_basement_verification_status_check` is a literal whitelist. The owner's 2026-09-07
-- Mapper release (2089 -> 2147 ingredients) introduces three statuses it did not contain, and the
-- database therefore refused 82 rows outright — including ALL 58 new ingredients, so the release
-- could not land at all:
--
--     PI Calculated / Global Reference        42 rows  (42 of them new)
--     Verified / Global Reference             21 rows  ( 9 of them new)
--     PI Calculated / Global DE Reference     19 rows  ( 7 of them new)
--
-- These are the owner's own provenance vocabulary and follow the shape the list already carries
-- ('Verified / PI Calculated', 'Verified / Public Label', 'PI Calculated / Needs Label Review').
-- This migration only widens the whitelist; it changes no row and no rule.
--
-- WHAT IT MEANS FOR THE ENGINE — read this before assuming a new ingredient is usable.
-- `verification_status` is consulted in exactly ONE engine gate:
-- src/features/product-intelligence/productBehaviorAuthority.ts, `verifiedPrefix()`, which admits a
-- Mapper row as a BASE donor only when the status STARTS WITH "verified" (case-insensitive).
-- So of the three values above, only `Verified / Global Reference` is BASE-eligible; the two
-- `PI Calculated / …` values are TOPPING-eligible only. That is the same distinction the list
-- already draws, applied consistently — 49 of the 58 new ingredients carry `approved_for_base=true`
-- and are nevertheless withheld from BASE by this rule. Whether that is correct for those rows is a
-- DATA question (are the sources strong enough to call them Verified?), deliberately left to the
-- owner. Nothing here changes verifiedPrefix, any weight, any threshold, or the BASE/TOPPING rules.
--
-- Idempotent: dropping with IF EXISTS and re-adding under the same name is safe to re-run, and the
-- constraint is re-validated against existing rows on every apply.

alter table public.mapper_basement
  drop constraint if exists mapper_basement_verification_status_check;

alter table public.mapper_basement
  add constraint mapper_basement_verification_status_check
  check (
    verification_status = any (array[
      -- unchanged, exactly as before this migration
      'Blocked',
      'Estimated',
      'Estimated / Needs Label Review',
      'PI Calculated / Needs Label Review',
      'Superseded Duplicate',
      'Vegan verified / allergen label review required',
      'Vegan verified / cross-contamination noted',
      'Vegan/dairy-free verified / allergen label review required',
      'Verified',
      'Verified / Basis Check Needed',
      'Verified / Engine mapping review',
      'Verified / PI Calculated',
      'Verified / Public Label',
      -- added 2026-09-07 with the 2147-ingredient release
      'PI Calculated / Global Reference',
      'PI Calculated / Global DE Reference',
      'Verified / Global Reference'
    ])
  );
