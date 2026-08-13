# Unified Product Intelligence — completion ledger

Date: 2026-08-13  
Branch: `codex/unified-product-intelligence`  
Baseline/HEAD: `5f796583955fb82f5ab08ce2e0236cb48cccdc16` (`origin/staging`)  
Deployment target requested: staging only  
Strict result: **NOT READY — EXACT INTERNAL DEFECTS REMAIN**

## 1. Requested scope

Replace source-specific product interpretation with one versioned, server-controlled product intelligence contract covering OCR/manual/import/catalog/Mapper products, dynamic taxonomy, Main envelopes, module eligibility, immutable recipe behavior snapshots, exhaustive Mapper/catalog audits, trustless Preview/Apply/Save/Production gates, documentation, tests, and staging deployment. Preserve Engine formulas, Mapper data, accepted recipe controls and desktop pixel geometry.

## 2. Completed work

- Added a versioned product taxonomy/policy/binding schema and authenticated resolver RPC in migration `0045_unified_product_intelligence.sql`.
- Added fail-closed Mapper behavior bindings for all 2,088 active Mapper IDs; no Mapper facts were changed.
- Added exact, identity-bound provisional Main policies/bindings for the reviewed Strawberry, Banana and Kiwi fixtures; structural non-flavour categories are `NOT_MAIN`; all other unreviewed rows remain `UNKNOWN`.
- Added immutable recipe-side `ProductBehaviorSnapshot` contracts, server result validation, behavior fingerprints and composition-sidecar persistence.
- Connected server resolution to Product Picker selection and stored its snapshot on Base/Topping lines.
- Added managed-product Main menu/store gates, Main floor/ceiling/hard-limit/equivalent-mass checks, same-family Multi-Main enforcement, 30% liquid dairy-carrier enforcement, and trustless Preview/Apply revalidation without changing Engine formulas.
- Added `SAVE` and `PRODUCTION` module gates for managed snapshots. Historical recipe lines without the new snapshot retain accepted legacy behavior.
- Preserved old payload byte shape by omitting an empty `behaviorSnapshots` object.
- Added a deterministic 2,088-row Mapper/process audit generator and generated CSV/Markdown reports.
- Added architecture, intake/versioning, resolver, profile-matrix and Main-envelope documentation.
- Revalidated the desktop Product Picker lock: 64/64 measured bounds pass.

## 3. Files changed

Unified Product Intelligence work is concentrated in:

- `supabase/migrations/0045_unified_product_intelligence.sql`
- `src/features/product-intelligence/*`
- `src/services/productIntelligence.ts`
- `src/features/constraint-studio/applyPipeline.ts`
- `src/features/constraint-studio/constraintStudioStore.ts`
- `src/features/ingredient-builder/{ProductPickerPopover,IngredientBuilder,IngredientRow,ToppingRow}.tsx`
- `src/features/recipe-composition/recipeCompositionPersistence.ts`
- `src/features/recipes/useCanonicalRecipeSave.ts`
- `src/features/production-workspace/useProductionWorkspace.ts`
- `src/stores/recipeStore.ts`
- `scripts/auditUnifiedProductIntelligence.mjs`
- `docs/products/*`
- `docs/formulation/MAIN_FLAVOUR_ENVELOPE_*.md`
- `docs/engine/PRODUCT_PROFILE_MATRICES.md`
- `reports/MAPPER_2088_PRODUCT_BEHAVIOR_AUDIT.{csv,md}`
- `reports/CATALOG_PRODUCT_BEHAVIOR_AUDIT.md`

The worktree also contains the inherited, unfinished Global Product Catalog candidate (`0043`, `0044`, catalog UI/services/Edge function). It was preserved and tested; it is not a deployed staging feature.

## 4. Tests added or changed

- Product resolver module matrix, snapshot/fingerprint, future policy injection and managed Save/Production gate tests.
- Main envelope tests: floor/ceiling/hard limit, equivalent factor, 299/300/301 g dairy-carrier boundary, same/mixed-family Multi-Main, Protein carrier exemption, stale behavior snapshot Apply rejection.
- Recipe composition snapshot round-trip and invalid snapshot fail-closed tests.
- Existing Supabase recipe round-trip tests now protect legacy payload shape as well as behavior snapshot persistence.
- Existing Global Catalog/OCR/Topping/private-price/final-label/Production/ARIA/pixel contracts retained.

## 5. Exact commands executed

```text
npm run typecheck
npx vitest run src/features/product-intelligence/productBehaviorResolver.test.ts src/features/product-intelligence/mainEnvelope.test.ts src/features/recipe-composition/recipeCompositionPersistence.test.ts src/features/constraint-studio/constraintStudioStore.test.ts src/features/ingredient-builder/IngredientTableUx.test.tsx --reporter=dot
npx vitest run src/features/recipes/useCanonicalRecipeSave.test.ts src/features/production-workspace/useProductionWorkspace.test.ts src/features/production-workspace/productionSession.test.ts src/features/production-workspace/productionSessionStore.test.ts --reporter=dot
npm run products:audit
npm run process:validate
npm test -- --reporter=dot
npx vitest run src/services/proCore/supabaseRecipes.test.ts src/features/recipe-composition/recipeCompositionPersistence.test.ts --reporter=dot
npm run lint
npm run build
node scripts/captureDesktopPixelLock.mjs
node --input-type=module -e <pgsql-parser command> supabase/migrations/0043_global_product_catalog.sql supabase/migrations/0044_global_product_catalog_trust_hardening.sql supabase/migrations/0045_unified_product_intelligence.sql
npx supabase db push --dry-run --linked
npx supabase functions list
npx supabase secrets list
git diff --check
```

## 6. Test results

- TypeScript: PASS.
- Focused resolver/Main/composition/constraint/UI: 5 files, 61 tests PASS; dedicated resolver/Main rerun: 2 files, 12 tests PASS.
- Save/Production accepted flows: 4 files, 24 tests PASS.
- Initial full suite: 464 files PASS, 1 file FAIL; 6,042 tests PASS, 2 FAIL. Both failures identified one backward-compatibility defect: empty `behaviorSnapshots` altered old saved payloads.
- Targeted post-fix rerun: 2 files, 32 tests PASS.
- Final full-suite rerun after the compatibility fix: 465 files, 6,044 tests PASS.
- Lint: PASS with 0 errors and 2 pre-existing Fast Refresh warnings.
- Production build: PASS; existing large-chunk warning remains.
- SQL parse: migrations 0043/0044/0045 PASS native PostgreSQL parser.
- Mapper/process audit: PASS, 2,088/2,088 unique/aligned.
- Pixel lock: PASS, 64/64 bounds.
- `git diff --check`: PASS before final ledger freeze; rerun required after this ledger.

## 7. Previously accepted flows retested

- Engine authenticity/calibration, Gelato/Sorbet/Vegan/Protein matrices.
- exact Main identity and Multi-Main ratio protection.
- ECO cost behavior and missing-price honesty.
- stabilizer contracts and whole-gram practicalization.
- Preview/Apply/Undo and stale/forged Apply rejection.
- saved recipe version immutability, restore and Base/Topping round-trip.
- Production session/rescue/actual authority.
- customer price isolation, label-only Topping nutrition/cost/Master Label projection.
- canonical machine/temperature choices and Home/Demo/Pro save capabilities.
- desktop Pro/picker pixel contract.

## 8. Deployment environment verified

- Linked Supabase was inspected read-only.
- `db push --dry-run --linked` fails before validating new migrations with `LegacyDbPushMissingLocalError`: remote migration versions are absent from the local ledger.
- Linked functions list does not contain `catalog-submit`.
- Required catalog runtime secret names are absent: `CATALOG_RISK_HMAC_SECRET`, `CATALOG_OCR_VERIFY_URL`, `CATALOG_OCR_VERIFY_KEY`, `TURNSTILE_SECRET_KEY`.
- No migrations, functions, secrets, staging frontend or production environment were changed.

## 9. Remaining incomplete items

1. **There is not yet one canonical product root and one ingest transaction.** `public.products` remains an owner/private source domain and `global_catalog_products/global_catalog_product_versions` remains a second identity/version domain. `unified_product_ingest_events` records completed catalog-version inserts; it is not the required `ingestProduct` authority used by every OCR/manual/admin/import/shop/franchise/internal adapter.
2. **Module unification is partial.** Picker, managed Main, Preview/Apply, Save and Production are connected to snapshots. Substitution does not resolve/persist the replacement product's new binding, and Cost/Monitor/Label still combine existing module-specific facts rather than consuming a single full server snapshot containing technical composition, nutrition, allergens, process and caller-private price source.
3. **Current built-in/legacy recipe rows can still become Main without a snapshot.** This compatibility exception is necessary until all accepted built-in products are server-classified and loaded with bindings, but it means the new Main contract is not universally authoritative yet.
4. **Policy/data coverage is intentionally incomplete.** Mapper audit is `MAIN_PROFILE_SPECIFIC=3`, `NOT_MAIN=119`, `UNKNOWN=1,966`. Only the reviewed dairy fruit policies are seeded. Approved Sorbet, Vegan, Protein, citrus/mango, chocolate/cocoa-equivalent, coffee retained-mass/infusion, alcohol ABV, compound nut-paste and approved mixed-family policies are not present and must not be invented.
5. **Catalog behavior coverage is not executable.** Active catalog counts/classification cannot be proven until migrations run on an aligned database. Current catalog classification also depends on governed `family/subfamily/form` data that existing catalog versions generally do not yet publish.
6. **Policy-change reclassification is not automatic.** New catalog versions classify, but mapping/taxonomy/policy changes do not yet enqueue and atomically publish a new current binding for every affected immutable product version.
7. **The mandatory full owner fixture matrix is incomplete.** The boundary tests above exist, but the requested product/profile/form/concentration matrices require the missing approved policies and a real database resolver.
8. **No served staging cross-account/RLS/Edge evidence exists** for Unified Product Intelligence or the inherited Global Catalog/OCR candidate.

## 10. Exact blockers and required external actions

- Reconcile the linked Supabase migration ledger deliberately and auditably. Do not run automatic history repair against staging.
- Supply owner/science-approved, versioned Main policies for every required family/form/profile/ABV/concentration case and approve exact liquid-dairy carrier identities.
- Decide and migrate the final single product core/version model, then route every source adapter through one server transaction.
- Configure and deploy the catalog verifier/risk/Turnstile dependencies only after security review.
- Run real PostgreSQL/RLS/Edge fixtures and authenticated staging flows across two accounts; then re-run full catalog/Mapper reconciliation and served pixel/mobile evidence.

## 11. Git diff and commit status

- Branch: `codex/unified-product-intelligence`.
- HEAD equals `origin/staging` at `5f796583955fb82f5ab08ce2e0236cb48cccdc16`.
- Worktree is intentionally dirty with the inherited Global Catalog candidate plus Unified Product Intelligence changes.
- No files staged, no commit created, no branch pushed, no PR created, no deployment performed.
- Engine formulas and Mapper source data have no intentional changes.
