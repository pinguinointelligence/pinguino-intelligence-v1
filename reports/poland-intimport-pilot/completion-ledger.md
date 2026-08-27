# Poland INTIMPORT → Product Intelligence — 20-product staging pilot

## Scope and immutable selection

- Source: `PL_POLAND_GELLATTI_SEMANTIC_CLASSIFIED.xlsx`, sheet `14_SEMANTIC_CLASSIFICATION`.
- Retained owner population: **731** rows. The original 820-row population was not used.
- Seed: `PINGUINO-POLAND-731-PILOT-2026-08-27-V1`.
- Algorithm: ascending `SHA-256(seed + NUL + source_product_id)`, first 20.
- The selection was written to `selection.json` before processing. No failed row was replaced and product 21 was never processed.
- Owner `S/T/O` and semantic columns were retained as authority. No Vision request was introduced for tabular imports.

## Before / after

| Before | After |
|---|---|
| INTIMPORT assembled its own completion/readiness result from import-row field presence. | INTIMPORT normalizes the row to the same Product Intelligence evidence contract used after Scanner recognition. |
| Import-specific provenance did not always reach the shared Product Accuracy authority. | Source, research receipt, derived, and Mapper evidence retain field-level provenance through shared Product Accuracy V2. |
| Research plans and multi-step receipts could lose a barcode discovered after the first receipt. | Targeted research executes before scoring; the receipt set proves one checksum-valid final GTIN while earlier non-barcode receipts must independently match product identity. |
| Admin-side Mapper reads could resolve zero donors because direct `mapper_basement` RLS returned no rows. | Existing read-only `mapper_basement_search` is used as the authenticated fallback; it never mutates Mapper. |
| The ingest SQL accepted Product Accuracy authority V1 while the shared scorer emitted V2. | Staging ingest accepts the current exact V2 authority without changing weights, thresholds, readiness science, or scores. |
| Exact canonical reuse was a client hint at the submit boundary. | The staging Edge independently derives exact canonical EAN reuse from canonical product/variant/ingest evidence before allowing idempotent reuse. |
| A successful exact identity match could relabel unrelated source facts as Mapper evidence. | Exact identity stays a separate dimension; row nutrition/ingredients keep their actual source authority. |

## Exact 20-row result table

`V/E/U` means verified / estimated / unknown Engine-profile fields. `Research` means autonomous research was attempted and lists newly credited facts where any were accepted.

| # | Source ID | Product | Role | EAN | Canonical result / PR | Exact identity | Accuracy | Metadata | Gellatti readiness / class | Semantic family / form | Mapper donor | V/E/U | Critical blockers | Research | Duplicate/reuse | Final import |
|---:|---|---|:---:|---|---|---|---:|---:|---|---|---|---:|---|---|---|---|
| 1 | PL-COM-P071A | KIWI | S | — | existing after pilot / PR-ING-007145 | source identity | 19% | 66.67% | NO / REVIEW | PRO_GELATO_COMPLETE_MIX_SPEEDY / DRY_MIX | none | 0/9/11 | INGREDIENTS_EVIDENCE_REQUIRED; missing carb/fat/protein/sugars; nutrition facts; TECHNICAL_DOSAGE_AUTHORITY_REQUIRED | attempted; none credited | reused; 0 duplicate | REVIEW |
| 2 | PL-BIE-00402 | Prima Finezja Kawa mielona | S | 5900194000273 | existing after pilot / PR-ING-007146 | exact researched GTIN | 28% | 66.67% | NO / REVIEW | COFFEE_GROUND / GROUND_DRY | PI-ING-001207, 0.828 | 0/0/20 | missing carb/fat/protein/salt/solids/sugars/water; nutrition required | manufacturer, ingredients, nutrition basis, energy and EAN credited | reused; 0 duplicate | REVIEW |
| 3 | PL-BIE-00152 | Krem z orzechów nerkowca GO Active | S | — | existing after pilot / PR-ING-007147 | source identity | 80% | 33.33% | NO / REVIEW | PROTEIN_NUT_SPREAD / PASTE | none | 7/0/13 | MISSING_TOTAL_SOLIDS_PERCENT; MISSING_WATER_PERCENT | attempted | reused; 0 duplicate | REVIEW |
| 4 | PL-BIE-00032 | Jogurt Fruvita | S | — | existing after pilot / PR-ING-007148 | source identity | 84.4% | 33.33% | YES / BASE_READY | YOGURT / DAIRY_SEMISOLID | PI-ING-000184, 0.94 | 0/20/0 | none; final Accuracy is below 85 | ingredients, nutrition, energy, macros, fibre and allergens credited | reused; 0 duplicate | REVIEW |
| 5 | PL-BIE-00247 | Nestlé Fitness Chocolate bar | T | — | existing after pilot / PR-ING-007149 | source identity | 49% | 66.67% | NO / REVIEW | BREAKFAST_CEREAL / DRY_SOLID | none | 0/0/20 | nutrition facts; family_and_form_evidence_missing | attempted | reused; 0 duplicate | REVIEW |
| 6 | PL-COM-P074A | LIME | S | — | existing after pilot / PR-ING-007150 | source identity | 71.4% | 66.67% | NO / BLOCKED | PRO_GELATO_COMPLETE_MIX_SPEEDY / DRY_MIX | PI-ING-001471, 0.94 | 0/18/2 | ingredients; technical dosage; technical_or_dosage_product | attempted | reused; 0 duplicate | BLOCKED |
| 7 | PL-COM-P025C | LATTEDICOCCO | S | — | existing after pilot / PR-ING-007151 | source identity | 19% | 66.67% | NO / REVIEW | PRO_GELATO_COMPLETE_MIX_SPEEDY / DRY_MIX | none | 0/0/20 | ingredients; core macros/water/solids/nutrition; dosage | attempted | reused; 0 duplicate | REVIEW |
| 8 | PL-BIE-00431 | Dr. Oetker Babeczki czekoladowe ze skórką pomarańczy | T | — | existing after pilot / PR-ING-007152 | source identity | 49% | 66.67% | NO / REVIEW | CAKE_MIX / DRY_MIX | none | 0/0/20 | nutrition facts; family_and_form_evidence_missing | attempted | reused; 0 duplicate | REVIEW |
| 9 | PL-COM-PC831 | COPERTURA FONDENTE CON POP CORN CARAMELLATO | S | — | existing after pilot / PR-ING-007153 | source identity | 19% | 66.67% | NO / REVIEW | PRO_GELATO_HARDENING_COATING / COATING | none | 0/0/20 | ingredients; core macros/water/solids/nutrition | attempted | reused; 0 duplicate | REVIEW |
| 10 | PL-BIE-00020 | Śmietanka do zup i sosów Mleczna Dolina 18% | S | — | existing after pilot / PR-ING-007154 | source identity | 84.4% | 66.67% | YES / BASE_READY | CREAM / DAIRY_LIQUID | PI-ING-000184, 0.94 | 0/20/0 | none; final Accuracy is below 85 | attempted | reused; 0 duplicate | REVIEW |
| 11 | PL-COM-P110A | GRANI ARANCIA | S | — | existing after pilot / PR-ING-007155 | source identity | 75.4% | 66.67% | NO / REVIEW | PRO_GRANITA_MIX / DRY_MIX_OR_CONCENTRATE | PI-ING-000947, 0.872 | 0/20/0 | INGREDIENTS_EVIDENCE_REQUIRED | attempted | reused; 0 duplicate | REVIEW |
| 12 | PL-COM-B920 | BASE PURE VEGAN P.Z | S | — | existing after pilot / PR-ING-007156 | source identity | 71.4% | 66.67% | NO / BLOCKED | PRO_GELATO_BASE_VEGAN / DRY_MIX | PI-ING-000062, 0.94 | 0/20/0 | ingredients; dosage; technical_or_dosage_product | attempted | reused; 0 duplicate | BLOCKED |
| 13 | PL-COM-B037 | CHIMERA | S | — | existing after pilot / PR-ING-007157 | source identity | 71.4% | 66.67% | NO / BLOCKED | PRO_GELATO_BASE_LOW_DOSE / DRY_MIX | PI-ING-001201, 0.872 | 0/20/0 | ingredients; dosage; technical_or_dosage_product | attempted | reused; 0 duplicate | BLOCKED |
| 14 | PL-BIE-00005 | Masło Ekstra bez laktozy Mleczna Dolina | S | 5900120025578 | exact canonical reuse / PR-ING-007158 | EXACT_CANONICAL_REUSE | 96% | 100% | YES / BASE_READY | BUTTER / FAT_SEMISOLID | PI-ING-000176, 0.94 | 6/14/0 | none | skipped as unnecessary | exact reuse; 0 duplicate | READY |
| 15 | PL-COM-PC637PB | CARAMEL MOU GIUBILEO | S | — | existing after pilot / PR-ING-007159 | source identity | 84.4% | 66.67% | YES / BASE_READY | PRO_GELATO_FLAVOR_PASTE / PASTE | PI-ING-000595, 0.94 | 0/20/0 | none; final Accuracy is below 85 | attempted | reused; 0 duplicate | REVIEW |
| 16 | PL-COM-P314 | FREE LIMONE | S | — | existing after pilot / PR-ING-007160 | source identity | 46.84% | 66.67% | NO / REVIEW | PRO_GELATO_BASE_SPECIAL / DRY_MIX | PI-ING-000802, 0.94 | 0/16/4 | ingredients; missing macros/nutrition; dosage | attempted | reused; 0 duplicate | REVIEW |
| 17 | PL-BIE-00159 | Strawberry & Crisps Waffle Baitz | T | — | existing after pilot / PR-ING-007161 | source identity | 94% | 33.33% | NO / REVIEW | WAFER_CONFECTIONERY / SOLID_PIECES | none | 7/0/13 | family_and_form_evidence_missing | attempted | reused; 0 duplicate | REVIEW |
| 18 | PL-COM-PC510P | FROLLINO | S | — | existing after pilot / PR-ING-007162 | source identity | 19% | 66.67% | NO / REVIEW | PRO_GELATO_VARIEGATO / VISCOUS_INCLUSION | none | 0/0/20 | ingredients; core composition/nutrition | attempted | reused; 0 duplicate | REVIEW |
| 19 | PL-COM-P245 | ANANAS CON PEZZI | S | — | existing after pilot / PR-ING-007163 | source identity | 19% | 66.67% | NO / REVIEW | PRO_GELATO_COMPLETE_MIX_SPEEDY / DRY_MIX | none | 0/9/11 | ingredients; core composition/nutrition; dosage | attempted | reused; 0 duplicate | REVIEW |
| 20 | PL-BIE-00230 | Prince Polo Kruchy wafelek z kremem kakaowym z odrobiną czekolady | T | — | existing after pilot / PR-ING-007164 | source identity | 89% | 33.33% | YES / TOPPING_READY | CHOCOLATE_WAFER_CONFECTIONERY / SOLID_PIECES | PI-ING-002068, 0.872 | 0/18/2 | none | attempted | reused; 0 duplicate | TOPPING_ONLY |

## Counts and blockers

Two truthful gates are reported separately:

- Shared role-readiness evaluator: **READY 5**, comprising **BASE_READY 4**, **TOPPING_READY 1**, **BASE_AND_TOPPING_READY 0**, **NOT_READY 15**.
- Final import status after the unchanged 85 Product Accuracy gate: **READY 1**, **TOPPING_ONLY 1**, **REVIEW 15**, **BLOCKED 3**, **CONFLICT 0**.
- Final usable outcomes: **2/20**. Rows 4, 10, and 15 satisfy role physics but remain REVIEW because Accuracy is 84.4, below the unchanged 85 threshold.
- Pilot lifecycle: the first diagnostic materialization created the 20 listed PRs. The final controlled two-pass acceptance then reused **20/20** on pass 1 and **20/20** on pass 2; newly created in that final replay: **0**.
- Exact-EAN canonical short-circuit present: **1** (`PL-BIE-00005`, EAN `5900120025578`). Canonical result reuse on the final replay: **20**.
- Family Mapper donor used: **11**; no donor used/needed: **9**.
- Unresolved readiness-critical products: **15**.
- Duplicates created: **0**.

Blocker groups overlap because one product may have more than one real readiness-critical gap:

| Blocker group | Products | Meaning |
|---|---:|---|
| Missing ingredients evidence | 10 | Required ingredients/functional evidence was not verified; the batch did not guess. |
| Missing core composition/nutrition/water/solids | 10 | Engine- or topping-use facts could not be verified, derived, or safely completed. |
| Technical dosage authority missing | 7 | Professional/technical products remained fail-closed after research. |
| ProductBehavior technical block | 3 | The product is genuinely technical/dosage-sensitive and the required authority is absent. |
| Family/form evidence insufficient for topping use | 3 | Owner classification is preserved, but supporting use evidence is not strong enough to publish READY. |
| Accuracy-only review at 84.4 | 3 | Role readiness passes, but the unchanged Product Accuracy threshold does not. |

## Canonical and integrity proof

- Canonical PR range: `PR-ING-007145` through `PR-ING-007164`; exact UUIDs are retained in staging ingest evidence and the live-test output.
- Second pass: 20 reused, 0 created, 0 failed, 0 duplicates.
- Database counts were identical before and after the final two-pass replay: **20 products, 22 historical versions, 44 historical behavior bindings, 0 PI runtime bindings**. The replay added neither a product, version, nor binding.
- Product Intelligence's authenticated base-approved Mapper donor set: **2075 rows before and after**, fingerprint `runtime-2075-a3f740db` before and after. The staging table contains **2088 active canonical rows**; its existing `mapper_basement_search` contract intentionally exposes only `is_active AND approved_for_base`. No Mapper row was added, updated, or deleted.
- No PI runtime binding was created for the commercial PRs. Mapper donors are field-level evidence only.
- No user-level price, existing canonical PR, Scanner photo/Vision path, Engine/Solver formula, Production rule, or Label calculation was changed.
- The remaining 711 owner rows were not processed.

## Verification ledger

### Files changed across the pilot workstream

- Workbook/selection/report: `src/data/products/intimportWorkbook.ts`, `reports/poland-intimport-pilot/selection.json`, `reports/poland-intimport-pilot/completion-ledger.md`, `scripts/run-poland-owner-20-live.mjs`.
- Shared INTIMPORT Product Intelligence path: `src/features/product-intelligence/intimportEnrichment.ts`, `intimportIntelligence.ts`, `intimportReceiptIdentity.ts`, `ownerProductClassification.ts`, `productRecognition.ts`.
- Canonical/Mapper services: `src/services/intimportCanonicalLookup.ts`, `ingredients.ts`, `mapperKnowledge.ts`, `productImportRuns.ts`, `productIngest.ts`.
- UI/Edge/database boundary: `src/pages/destinations/ProductImportPage.tsx`, `supabase/functions/catalog-submit/index.ts`, `supabase/functions/intimport-enrich/index.ts`, `supabase/functions/product-import-run/index.ts`, `supabase/migrations/20260827230000_product_accuracy_v2_ingest_authority.sql`.
- Tests: the colocated workbook, evidence-authority, standard-run, owner-classification, enrichment, research-provider, official-source, canonical-lookup, receipt-identity, Mapper paging, ingest-boundary, migration-authority, dry-run and live-pilot test files.
- Generated parity only: `docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.json` and the three `supabase/functions/_shared/generated/productionRescueEngine.*` artifacts. These were regenerated because accepted staging source had advanced without its matching generated closure; no Engine/Solver source or science changed.

### Focused and integration tests

- `npm test -- --run <18 INTIMPORT/Scanner/Mapper/ingest test files>` — **18 files, 208 tests passed**.
- `node scripts/run-poland-owner-20-live.mjs --project-ref=tunabqqrwabacxjcxxkz` — **1 live staging test passed** on the rebased branch, 20/20 reused twice, 0 failures, 0 duplicates; duration 91.97 s.
- `npm test -- --run src/features/constraint-studio/recipeVectorProximity.test.ts --reporter=verbose` — **23/23 passed**; confirms the single default-parallel full-suite timeout is load-related and the branch has no diff in this test/Solver area.
- `npm run production-rescue:bundle-check` and generated bundle parity test — **passed**.

### Full gates

- Full suite on the final rebased branch: `npm test -- --reporter=dot --silent=passed-only --maxWorkers=2` — **775 files passed, 22 skipped; 9562 tests passed, 121 skipped; 0 failures**. Duration 696.14 s. The first default-parallel run completed 797 files with one unchanged Horchata test timing out at 5 s; the same file passed independently and the complete suite passed twice with bounded concurrency, without changing timeout or Engine/Solver.
- Typecheck: `npm run typecheck` — **passed**.
- Lint: `npm run lint` — **0 errors, 4 pre-existing Fast Refresh warnings**.
- Build: `npm run build` — **passed**; only the existing large-chunk and mixed static/dynamic import warnings were emitted.

### Staging changes already applied

- Exact Product Accuracy V2 ingest-authority migration applied to staging and registered as migration `20260827230000`.
- `catalog-submit` Edge deployed to staging project `tunabqqrwabacxjcxxkz`.
- Full app deployment / served acceptance: **PENDING**.

## Completion ledger

1. Requested scope: shared Scanner Product Intelligence authority for exactly 20 deterministic Poland rows, staging only.
2. Completed work: shared evidence/scoring/readiness/canonicalization path, secure exact-EAN idempotency, Mapper read parity, V2 ingest authority, live two-pass pilot.
3. Files changed: see final `git diff --stat origin/staging...HEAD`; implementation is confined to INTIMPORT evidence/orchestration, Mapper read fallback, ingest boundary/Edge, one migration, tests, live runner, and generated Production Rescue parity artifacts.
4. Tests added/changed: INTIMPORT evidence authority, receipt lineage, enrichment provenance, ingest boundary, migration authority, Mapper paging/fallback, and live staging pilot.
5. Exact commands: recorded above and in the final owner report.
6. Test results: focused, live staging pilot, isolated regression, Production Rescue parity, and full suite green.
7. Accepted flows retested: Scanner contract tests, exact EAN reuse, Product Accuracy/readiness, Mapper immutability, ProductBehavior and Production Rescue parity.
8. Deployment environment: staging project `tunabqqrwabacxjcxxkz`; public production is out of scope and untouched.
9. Remaining incomplete items: staging app deployment and served runtime checks.
10. External blockers/actions: none at this revision.
11. Git state: branch `codex/intimport-product-intelligence-pilot`; final commit/status recorded after acceptance.
