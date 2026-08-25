# Gellatti final label system acceptance

Date: **2026-08-25**  
Integration branch: `codex/final-label-system`  
Target environment: **staging only** (`https://staging.pinguinoai.com`)

## Final profile status

| Profile | Status | Acceptance evidence |
| --- | --- | --- |
| EU | **PASS** | Independent `eu-label-v2`, destination/language/operator rules, Annex II allergen authority, QUID/compound review, per-100 g declaration, physical x-height, saved staging snapshot v3. |
| UK | **PASS** | Independent `uk-label-v2`, GB/NI context, prepacked and PPDS coverage, GB address rule, saved GB PPDS staging snapshot v4. |
| USA | **PASS** | Independent `fda-nutrition-facts-v2`, FDA serving and nutrient data, DV/rounding, standard/dual/tabular/linear families, saved standard staging snapshot v5. |
| Canada | **EXTERNAL ASSET BLOCKED** | Bilingual `canada-nft-v2`, Canadian RA/serving, NFT, rounding and FOP decision logic pass. Required regulatory print remains fail-closed because the official Health Canada FOP artwork package is not installed. |
| AU/NZ | **PASS** | Independent `fsanz-nip-v2`, AU/NZ sub-context, NIP per serving/per 100 g, PEAL, local supplier, saved New Zealand staging snapshot v6. |
| WORLD | **PASS** | Neutral `world-neutral-v1`, actual batch ingredients, confirmed allergens, neutral per-100 g nutrition, traceability/storage/business/net quantity and optional codes; saved staging snapshot v2 with `PRINT_READY_UNIVERSAL`. |

System output status:

- PDF: **PASS** for EU, UK, USA, AU/NZ and WORLD; Canada draft PDF passes while regulatory PDF remains asset-blocked.
- System print: **PASS**. The native system print document was invoked from served WORLD and EU snapshots. The product correctly does not claim silent browser printing.
- Printer software profiles: **PASS** for all established presets in `PRINTER_PROFILE_MATRIX.csv`; hardware verification remains **NO** until a real printer is physically tested.

## Architecture and data authority

- The market selector contains exactly EU, UK, USA, Canada, Australia / New Zealand and World / Universal.
- Regulatory content is rendered by independent market renderers. Only geometry, typography, business, ingredient and machine-code primitives are shared.
- Completed labels read immutable `ACTUAL` Production data. The verified staging run contained a 1365 g actual batch while the consumer package fill was independently selected as 500 g.
- Actual ingredients, weights/order, allergens, nutrition, LOT, production date, package quantity, dates, business identity, market/profile versions, layout and printer evidence are stored in append-only label snapshots.
- Old snapshot URLs include both `run` and `snapshot`. Creating a new version refreshes the current Account Label Profile, appends a new snapshot and never rewrites the prior version.
- Shelf life, added nutrients, density, Canadian FOP exemptions and optional GTIN/QR values fail closed when authority is absent; the system does not invent them.
- `PRINT_READY_UNIVERSAL` and `PRINT_READY_REGULATORY` are distinct states.

The detailed official-source audit and implementation contract are in:

- `GELLATTI_GLOBAL_LABEL_COMPLIANCE_AUDIT_2026-08-25.md`
- `LABEL_MARKET_AUTHORITY_MATRIX.md`
- `LABEL_PRINT_READY_MATRIX.csv`

## Staging database acceptance

Applied only to staging Supabase project `tunabqqrwabacxjcxxkz`:

- migration: `20260825180000_final_six_label_profiles_and_versioned_snapshots.sql`
- SHA-256 after the legacy backfill fix: `830ac1ddd1a0a664b35c97731cf924a45ab0c80a3267edc746e4eb4fd4d5e7cc`
- transaction-wrapped exact-file application; only migration version `20260825180000` was repaired as applied
- exactly six allowed profile keys
- legacy snapshots backfilled without fabricating printer verification (`legacy-unconfigured`, `UNVERIFIED`)
- primary key `snapshot_id`
- uniqueness on `(run_id, snapshot_version)` and `(run_id, content_hash)`
- immutable update/delete trigger enabled
- versioned save RPC and print-readiness checks present

The standard migration-history dry run was not used to apply unrelated history divergence. No production database migration was run.

## Served-browser acceptance

Verified on the served staging build from the same completed Production Run `2814eb6c-f6c6-456d-b6bf-c320d6d1a081`:

| Version | Profile | Snapshot ID | Result |
| --- | --- | --- | --- |
| v2 | WORLD | `57f19407-9af4-4984-bca9-fd8e51ce382d` | `PRINT_READY_UNIVERSAL`; exact snapshot reopen; PDF and system print document. |
| v3 | EU | `fa91f47c-bbdd-4177-b72e-94cb341523df` | `PRINT_READY_REGULATORY`; exact snapshot reopen; PDF and system print document. |
| v4 | UK PPDS / GB | `7d3b6b12-12dc-466e-aaf8-a10f6f08edf6` | `PRINT_READY_REGULATORY`; exact snapshot reopen; PPDS wording, ingredients and GB responsible address. |
| v5 | USA | `cc83e346-6f69-4521-b50f-3441ce6d7309` | `PRINT_READY_REGULATORY`; exact snapshot reopen; standard FDA Nutrition Facts. |
| v6 | AU/NZ / New Zealand | `00210c13-8f16-4852-b514-202ecc99e2df` | `PRINT_READY_REGULATORY`; exact snapshot reopen; FSANZ NIP and NZ supplier. |

For EU, UK, USA and WORLD the served 1440/1024/390 measurements showed no document overflow and no physical-preview clipping; 390 px uses a controlled horizontal label rail. AU/NZ uses the same physical component and passed served snapshot/PDF plus automated responsive/geometry regression. Canada responsive long-bilingual/FOP cases pass automated geometry tests, but final regulatory print is intentionally unavailable until the official artwork package is installed. Row-level evidence is in `LABEL_SERVED_BROWSER_ACCEPTANCE.csv`.

## PDF acceptance

Served PDFs downloaded from staging:

- `gellatti-label-lot-20260824-2814eb6cf6-world-102x152mm.pdf`
- `gellatti-label-lot-20260824-2814eb6cf6-eu-102x152mm.pdf`
- `gellatti-label-lot-20260824-2814eb6cf6-uk-102x152mm.pdf`
- `gellatti-label-lot-20260824-2814eb6cf6-us-102x152mm.pdf`
- `gellatti-label-lot-20260824-2814eb6cf6-au_nz-102x152mm.pdf`

Each served file reports 289.134 × 430.866 pt, equivalent to 102 × 152 mm. Two pages match the configured two copies. Local golden PDFs additionally verify full embedded Noto fonts, Unicode/diacritics, bilingual text, QR/Code 128/EAN, exact geometry and no browser chrome. Canada output is explicitly a draft/watermarked preview without unofficial FOP artwork.

## Canada official external action

The only accepted Canada activation blocker is the ready-to-use high-resolution official Health Canada FOP package.

1. Email `smiu-ugdi@hc-sc.gc.ca`.
2. Use the exact subject `HPFB BNS Compendium of Nutrition Symbol Formats`.
3. Request the ready-to-use high-resolution front-of-package nutrition symbol package.
4. Retain the original package and checksum.
5. Install approved outputs and a manifest under `src/assets/regulatory/canada-fop/`.
6. Set the exact `canadaFopAssetPackageVersion` and approved asset ID, then rerun Canada golden/PDF/browser QA.

No traced, redrawn, competitor-derived or approximate symbol is accepted.

## Verification commands

Final results on the integrated branch:

- `npm test -- --reporter=dot` — **NOT FULLY GREEN AFTER THE LATEST STAGING REBASE**: 751 test files passed, 3 failed by the 5000 ms timeout, 2 skipped; 9257 tests passed, 3 timed out, 101 skipped; duration 868.72 s. The failures were `recipeVectorProximity`, `compritalPack.dryrun` and `productProductionAccuracyCensus.dryrun`; none is a label test and none reached an assertion failure.
- The same isolated command for those three files on a clean detached `origin/staging` baseline reproduced the `recipeVectorProximity` and `productProductionAccuracyCensus` timeouts (2 failed / 23 passed); `compritalPack.dryrun` passed there and timed out intermittently on the integrated branch. The local commit differs from `origin/staging` only in label acceptance documentation, so these two baseline timeouts were not introduced by the label integration.
- `npx vitest run src/features/master-label/LabelWorkspace.runtime.test.tsx src/services/labels/labelRepository.test.ts src/features/master-label/regulatoryNutrition.test.ts src/features/master-label/masterLabelMarketGolden.test.ts --reporter=dot` — **PASS**: 4 files / 38 tests.
- `npm run typecheck` — **PASS**.
- `npm run lint` — **PASS** with 0 errors and 4 pre-existing Fast Refresh warnings outside the label feature.
- `npm run build` — **PASS**: 1475 modules transformed; only the documented `bwip-js` dynamic-import and large-chunk warnings remain.
- `npx vitest run src/features/master-label/LabelWorkspace.runtime.test.tsx src/services/labels/labelRepository.test.ts src/pages/destinations/GlobalDestinationPages.test.tsx --reporter=dot` — **PASS**: 3 files / 17 tests.
- `npx vitest run src/features/master-label/LabelWorkspace.runtime.test.tsx src/services/labels/labelRepository.test.ts --reporter=dot` — **PASS**: 2 files / 11 tests.
- `npx vitest run src/features/master-label/LabelWorkspace.runtime.test.tsx src/features/master-label/regulatoryNutrition.test.ts --reporter=dot` — **PASS**: 2 files / 17 tests.

The full suite re-ran accepted recipe, Engine, ProductBehavior, Production, persistence, plan-limit and profile-routing flows. Its three timeout failures are recorded above rather than hidden. Test-generated product-audit JSON files were restored after the run; the Mapper dataset was not modified.

## Deployment boundary

- Staging Vercel project/deployment was verified READY and aliased to `https://staging.pinguinoai.com`.
- The staging browser served the expected current asset bundle and the versioned snapshot UI.
- No public production deployment, production Supabase migration, secrets, billing, Mapper dataset or Engine/solver logic was changed.

**ONLY SIX LABEL PROFILES ARE SUPPORTED: EU, UK, USA, CANADA, AU/NZ, WORLD.**

**WORLD IS UNIVERSAL INFORMATIONAL OUTPUT, NOT REGULATORY CERTIFICATION.**

**COUNTRY PROFILES USE THEIR OWN VERIFIED REGULATORY RENDERERS.** Canada remains fail-closed at regulatory print activation until its official FOP asset package is installed.

**PUBLIC PRODUCTION WAS NOT DEPLOYED.**
