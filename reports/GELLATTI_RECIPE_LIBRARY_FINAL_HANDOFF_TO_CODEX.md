# GELLATTI Recipe Library — final Claude handoff to Codex (2026-09-12)

> **Codex execution update, 2026-09-12:** the historical “NOTHING WRITTEN” checkpoint below has been superseded by the fail-closed execution record in `reports/GELLATTI_RL05_RL20_PHASE1_CLOSEOUT_2026-09-12.md`. The three guarded migrations are applied, 75/75 markets are active, and 85 v23 requests are approved with 117 usable physical routes including the three pre-existing milk routes. RL-05 and RL-20 remain **NOT DONE** because 87 products were rejected before creation as `approval_not_ready`, one product is `blocked`, and the required SMP/DEXTROSE/TARA representative routing cannot pass without new exact scientific/product authority. RL-36 was not started because the Owner explicitly gated it on both RL-05 and RL-20 being DONE.

## 1. Code state
- **PR #319** merged — `34950c7f341f32957dfe082da49a994cef6099b2`. It carries:
  - the official library (177 recipes / 1510 lines / 5 collections / 354 images);
  - per-recipe readiness;
  - „Zrób te lody” for HOME / PRO / Demo / Community, all through one adoption path (`src/features/recipes/workingCopy.ts`);
  - the provenance sidecar `gellatti_provenance_v1`;
  - HOME matching over the library, HOME start sources, and „Moje” reopening in HOME;
  - the v23 country-products pipeline (DB dry run only).
- **PR #322** merged — `86a4af14959ea81af73caf687b8a18da2fbe27d5`. Community „Zrób te lody” now asks before replacing an unsaved draft.
- **Canonical staging** = `86a4af14`. Production (`origin/main` `7fa36890`) is untouched and out of scope for this phase.

## 2. Master checklist RL-00 → RL-36 — DONE 34 · BLOCKED/HANDED 3 · ACTIVE 0 · TODO 0

| Status | Items |
|---|---|
| DONE | RL-00–04, RL-06–19, RL-21–35 |
| HANDED TO CODEX | RL-05 (v23 DB activation), RL-20 (country routing at runtime), RL-36 (missing non-base products) |

RL-28 note: on staging, reopening a saved recipe preserves identity, version and working state. Saving a provenance copy on the HOME QA account was refused by the plan cap — "Osiągnięto limit zapisanych receptur (1)" — which is correct, not a library defect. The provenance round-trip through save is unit-tested in `src/features/recipes/recipeProvenance.test.ts`.

## 3. Served QA already proven on staging (do not re-run without a regression)
- Official → PRO, Official → HOME (HOME account through `/recipes`), Community → PRO and Community → HOME (HOME account).
- Official source immutability: after a real edit the working copy was 584/41/80 g, while the library original still showed 490/65/150 g. Community source immutability.
- HOME start sources, and HOME reopening a saved recipe from „Moje”.
- Product-blocked recipe #24 and explicit blocker #020.
- Desktop and mobile (375 px, no overflow).
- 354/354 recipe images and 10/10 collection heroes.

## 4. RL-05 — v23 base activation: NOTHING WRITTEN
The owner approved the writes, and that staging and production share Supabase `tunabqqrwabacxjcxxkz`. Claude still stopped before any write, for two reasons:
1. The auto-mode permission check blocked the narrow migration in step 2.
2. The prepared apply executor signs in with QA fixture passwords (`scripts/countryProducts/lib/applyExecutor.mjs` → `signInWithPassword`), and Claude may not use passwords.

Following the owner's order, the market rows were not created either: they come after the gate fix.

**Pre-write snapshot (read-only):** `docs/country-products/gelato-base-v23/rl05-handoff/prewrite-readonly-snapshot-2026-09-12T1724Z.json`. It has:
- counts: 18 markets, 3 routes, 3 slot reviews, 2601 products, 4697 versions;
- the live routes and why they are unusable;
- the shared-DB evidence.

**75 markets:**
- present (18): AT BE CZ DE DK ES FI FR GB IE IT NL PH PL PT SE SK US;
- missing (57): ready as one idempotent insert in `rl05-handoff/catalog_market_countries_57.sql`. Names come from the v23 registry `countries[]` (workbook sheet 02_KRAJE_75). It uses `on conflict (code) do nothing` and sort_order 190–750.

**Prepared package:** `docs/country-products/gelato-base-v23/` (`registry.json`, `manifest.json`, `catalog-dedupe-snapshot.json`) and the reports `reports/COUNTRY_PRODUCTS_V23_*.md`.
- 450 selections: 375 exact products, plus 75 SUCROSE on the global PI (no product route by design).
- 189 exact PR identities (186 duplicates prevented). Reuse `PR-ING-007174` (FR milk).
- At the 18-market state: 48 products and 77 routes are creatable, 285 routes are blocked by the market foreign key, and 12 are held (see `COUNTRY_PRODUCTS_V23_DB_PACKAGE.md`). Once the 57 markets exist, re-run the importer so the plan recomputes the market-blocked routes.
- Approval token: `GELLATTI-V23-PR-ING`.

**Eligibility gate (RL-20 root cause):** `private.product_canonical_slot_candidate_is_valid_v1` requires `lower(mapper.verification_status) like 'verified%'`. MILK, CREAM and SMP PIs are `Estimated / PI Calculated`, so the live ES/FR/PL milk routes resolve to nothing and the library shows „0 z 9”. The owner-approved narrow fix, with negative controls and rollback, is in `rl05-handoff/proposed_route_slot_eligibility_explicit_approval.sql`. It uses the explicit `approved_for_base` / `approved_for_engines` flags instead.

## 5. Exact remaining Codex actions (in owner order)
1. Re-capture the snapshot read-only, using the 12-query SELECT inside `catalog-dedupe-snapshot.json`. Set `seedCopy: false`.
2. Apply the proposed migration as one forward-only migration. Run its negative and positive checks. Expect the 3 milk routes to become usable, and „(ES): 1 z 9” for a PRO account with market ES.
3. Run `catalog_market_countries_57.sql`, then prove 75/75.
4. Re-run `node scripts/countryProducts/importGelatoBaseV23.mjs <v23.xlsx>` against the fresh snapshot and review the regenerated DB package.
5. Reconcile against the current shared PR-ING semantic binding (migration `20260912120000`, applied). Base roles keep the fail-closed Mapper-reference requirement; only TOPPING_ONLY may omit it.
6. Apply with `node scripts/countryProducts/applyGelatoBaseV23.mjs --project-ref=tunabqqrwabacxjcxxkz --apply --owner-db-approval=GELLATTI-V23-PR-ING`. This needs the QA fixture credentials in Codex's environment.
7. Runtime-check one route per role in ES, DE, US, CA, AU, NZ, JP, AE, ZA and BR. Use `resolve_country_product_slots_v1` as a signed-in user, then the Recipe Library detail. Confirm there is no silent fallback.
8. Mark RL-05 and RL-20 DONE only on that evidence.

**Rollback:**
- Migration: restore the old function body from `20260904110935` (the only difference is the one removed line).
- Markets: delete the 57 codes only where no `country_product_slot_assignments` row references them.
- Products: identify the created rows through the executor's `product_add_requests.idempotency_key` values.

## 6. RL-36 — Codex
Missing non-base products (roasted almond pieces, wafer crumble, saffron, salep, cachaça, gum arabic, hojicha, kataifi, kirsch, mastiha, …) are deferred by the owner's decision and must not block the release. The deterministic slots workbook `GELLATTI_RECIPE_LIBRARY_75_COUNTRY_PREPARATION_v1.xlsx` (RL-35, 130/130 checks) covers them; it is in `~/Developer/official-recipe-library-work/75c-prep/`.

## 7. Known observation outside this scope
HOME's central Search resolver mapped „mleko” to „50 FIORDILATTE F · Giuso Base Mix” rather than plain milk. That belongs to the Search workstream, not the library.
