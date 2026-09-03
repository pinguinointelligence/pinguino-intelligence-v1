# Canonical Product Picker + Country Resolution v1.9 — active checklist

Updated: 2026-09-04 (Europe/Madrid)

## Current state

- Workstream: **46 / 48 verified done = 95.8%**.
- Denominator unchanged: 48 capability gates. Blocked items remain in the denominator.
- Status: **PARTIALLY IMPLEMENTED / BLOCKED ON APPROVED COUNTRY DEFAULT DATA**.
- Owner QA is separate, excluded from the denominator, and is not marked.
- Current canonical Git base: `origin/staging` at `46e6000fd5f6f9dcf44543c7463371bbfe4667f6`.
- FILTR contains that base through merge commit `ff5a0e7e13dfd538fb184750e842e450afe964db`.
- No semantic overlap was found between the latest staging delta and the country resolver, picker contracts, or CP-44 Replace seam.
- No active Global Country owner/workstream remains. The stale `claude/global-country-readiness` worktree is clean, behind staging, has no PR/session, and contains no canonical exact-SKU picker resolver to reuse.
- Production/main and the production Supabase project were not touched.

## Canonical authorities implemented

- One explicit `country + Mapper slot -> exact product` authority with CATALOG-admin approval metadata.
- At most one active `PRIMARY_DEFAULT` per country/slot.
- Explicitly ranked `SAFE_FALLBACK` rows only; no price, recency, brand, alphabetic, or insertion-order winner.
- Exact country, current product/version/binding, ready Mapper-slot binding, shared visibility, and product-owned Engine profile validation.
- Resolver precedence: user preferred exact SKU, approved country primary, explicit same-country fallback, otherwise no exact row so the existing generic Mapper ingredient remains.
- Existing CP-36 `(user_id, mapper_ingredient_id) -> preferred_product_id` pointer is strengthened to require a current exact product-owned Engine profile.
- Vercel `/api/product-country` reads only the supported coarse `x-vercel-ip-country` request header.
- UI/browser language inference has been removed from Product Country.
- Versioned guest Product Country persistence and atomic conflict-aware guest-to-account merge.
- Shared HOME/PRO resolver hook and one canonical technological row with the resolved exact SKU in secondary text.
- Conscious exact commercial selection/scan may update CP-36; automatic generic resolution does not.
- Contextual Replace remains on the accepted CP-44 path.

## Verification

- Focused country + picker + CP-44 seam: 25 files / 256 tests passed.
- Full regression: 945 files / 11,930 tests passed; 23 files / 122 tests skipped.
- `npm run verify:staging` passed:
  - owner-locked guard passed;
  - protected-path guard passed with the previously accepted CP-44 acknowledgement;
  - 18 contract files / 179 tests passed;
  - typecheck passed;
  - lint passed with 0 errors / 7 existing warnings;
  - production build passed.
- Actual staging-Supabase rollback validation compiled all three FILTR migrations in order and executed live precedence assertions. The country migration was intentionally rolled back after the assertions.
- Local Docker/Podman is unavailable, so the standalone pgTAP files cannot run locally. Their equivalent precedence kernel was executed against the actual staging PostgreSQL schema during rollback validation.
- Local `verify:staging` is not served-staging E2E.

## Staging database reconciliation

The staging Supabase migration ledger has extensive pre-existing drift: many remote versions are absent from the repository and many repository versions are absent remotely. A normal `supabase db push --linked --dry-run` refuses to proceed. No ledger repair and no `--include-all` push was attempted.

During rollback validation, Supabase committed each earlier migration separately before the final intentional failure. These two FILTR migrations are therefore present on staging earlier than the intended Git merge order:

- `20260903170000_canonical_product_picker_deterministic_order.sql`
- `20260903173641_user_preferred_exact_product_slots.sql`

The country migration remains unapplied, proven by a follow-up dry-run:

- `20260903212502_country_product_resolution_authority.sql`

No destructive rollback was attempted. The normal branch/PR/CI path must reconcile the Git code before the country migration is applied.

## Active capability ledger

| ID | Status | Capability | Acceptance evidence / blocker |
| --- | --- | --- | --- |
| CP-01 | DONE | Work isolated from active Cloud work | Dedicated branch/worktree; current staging merged |
| CP-02 | DONE | PRO and HOME use the shared picker | Parity test |
| CP-03 | DONE | Non-Demo HOME/PRO use shared live catalog transport | Library/parity tests |
| CP-04 | DONE | Canonical top-filter order | Domain/render tests |
| CP-05 | DONE | Favorites default when present; All otherwise | Domain/render tests |
| CP-06 | DONE | Favorites search remains in Favorites | Rendered contract test |
| CP-07 | DONE | Empty Favorite search exposes Search All | Interaction test |
| CP-08 | DONE | Favorites do not reorder active-query results | Presentation/search tests |
| CP-09 | DONE | Recency is empty-query-only | Presentation/search tests |
| CP-10 | DONE | Taxonomy separates family, form, and role | Taxonomy tests |
| CP-11 | DONE | Nut paste resolves under Nuts | Taxonomy tests |
| CP-12 | DONE | Governed Sugar/Stabilizer/Inulin results | Taxonomy tests |
| CP-13 | DONE | Contextual data-derived fruit-form filters | Domain/render tests |
| CP-14 | DONE | Contextual data-derived technical filters | Domain tests |
| CP-15 | DONE | Product taxonomy remains separate from recipe role | No role top filters; tests |
| CP-16 | DONE | Multilingual Milk intent | Five-language search tests |
| CP-17 | DONE | Generic intent differs from brand/EAN/article intent | Projection tests |
| CP-18 | DONE | Technology-first Milk/Cream titles | Projection tests |
| CP-19 | DONE | Numeric Milk percentage order | Projection tests |
| CP-20 | DONE | Data-driven Cream percentage order | Projection tests |
| CP-21 | DONE | Generic duplicates collapse to one Mapper slot | Projection tests |
| CP-22 | DONE | No arbitrary commercial-only winner | Fail-closed regression |
| CP-23 | DONE | Exact brand/EAN/article discovery remains | Exact-intent/search tests |
| CP-24 | DONE | Correct Add/Replace action | Rendered picker tests |
| CP-25 | DONE | Compact horizontally scrollable filter row | Responsive/source tests |
| CP-26 | DONE | HOME/PRO discovery cannot diverge locally | Shared parity gate |
| CP-27 | DONE | Locale-resource authority retained | Shipped-locale tests |
| CP-28 | DONE | Mapper/Scanner/Engine/solver authority preserved | Diff/protected-path/full regression |
| CP-29 | DONE | Canonical technical ordering preserved | Server-order regression |
| CP-30 | DONE | Primary Product Country account control | Rendered ES/PL/DE save test |
| CP-31 | DONE | Integrate canonical Global Country schema/service | One non-competing authority; compiled against staging PostgreSQL |
| CP-32 | BLOCKED | Resolve slot through approved primary-country SKU | Authority is ready, but no owner-approved ES/PL/FR assignment rows exist; no winner invented |
| CP-33 | DONE | Prove no foreign commercial fallback | Exact-country candidate filter, fail-closed generic result, source/DB assertions |
| CP-34 | DONE | Canonical safe same-country fallback | Explicit admin-ranked fallback only; live DB kernel assertion |
| CP-35 | DONE | Preferred exact SKU before country default | Live DB precedence assertion; invalid pointer falls through |
| CP-36 | DONE | Deterministic user/slot preferred SKU authority | Unique pointer, guarded RPCs, RLS, validation, tests |
| CP-37 | DONE | Canonical country-base product relationship | Single country/Mapper-slot/exact-product authority |
| CP-38 | DONE | Exact SKU behind canonical title | One-row projection and focused rendered tests |
| CP-39 | DONE | Reliable coarse first-country signal | Vercel request-header endpoint and endpoint tests; no GPS |
| CP-40 | DONE | Remove browser/UI-language inference | Service source contract and ES/PL/FR locale matrix |
| CP-41 | DONE | Explicit country survives travel/VPN/locale | Account-first persistence tests |
| CP-42 | DONE | Signed-out Product Country persistence | Versioned corruption-safe guest store/tests |
| CP-43 | DONE | Guest-to-account country merge | Atomic RPC, explicit conflict UI, client/source tests, staging SQL compile |
| CP-44 | DONE | Contextual Replace | Combined CP-44 seam passes in 25-file / 256-test gate |
| CP-45 | DONE | HOME/PRO country-resolution parity | Shared resolver hook/source contract |
| CP-46 | DONE | HOME/PRO user-override parity | Shared resolver/picker authority |
| CP-47 | DONE | Automated country/override matrix | Locale, guest/account, override, invalid/fallback, foreign-fail-closed tests; full regression green |
| CP-48 | BLOCKED | Served-staging E2E | Requires normal Git merge, country migration, and approved default rows for truthful ES/PL/FR scenarios |

## Frozen remaining categories

- `DONE`: CP-01–CP-31, CP-33–CP-47.
- `IN PROGRESS`: none.
- `WAITING_ON_GLOBAL_COUNTRY`: none.
- `WAITING_ON_CLOUD_CONFLICT`: none.
- `OWNER_DECISION_REQUIRED`: CP-32 — provide explicit approved country/Mapper-slot/exact-product assignments for Spain, Poland, and France.
- `INTERNAL_SAFE_REMAINING`: checkpoint/push branch; normal PR/CI reconciliation; apply country migration only after merge.
- `SERVED STAGING E2E`: CP-48.
- `OWNER QA`: not started and not marked.

## Completion ledger

1. Requested scope: continue CP-31–CP-48 without stale blockers while preserving canonical precedence and CP-44.
2. Completed work: country/default authority, user override wiring, coarse-country bootstrap, guest persistence/merge, HOME/PRO parity, automated matrix, and regression verification.
3. Files changed: country migration/pgTAP; global catalog service/contracts/hook; guest store; Vercel endpoint; picker projection/selection; Account Settings conflict UI; tests; this report.
4. Tests added/changed: country migration contract, guest store/service, Account Settings conflict, canonical projection, picker selection/CP-36, and pgTAP precedence/RLS coverage.
5. Exact commands: focused `npm test -- --run ...` (25 files), `npm test`, `npm run verify:staging`, Supabase linked dry-runs, and rollback-only SQL validation.
6. Test results: focused 256 passed; full 11,930 passed / 122 skipped; staging gate passed; live SQL precedence assertions passed.
7. Previously accepted flows retested: shared HOME/PRO discovery, exact search, favorites/recency, contextual Replace, atomic recipe replacement, ProductBehavior seams, and owner contracts.
8. Deployment environment: staging Vercel/Supabase identified; two prerequisite FILTR DB migrations present; country migration and Git app deployment pending; production untouched.
9. Remaining incomplete: CP-32 and CP-48.
10. Exact blockers: no owner-approved ES/PL/FR assignment rows; served proof cannot truthfully claim local defaults without them.
11. Git diff/commit status: feature changes are ready for checkpoint; exact commit/push state is reported in chat after the checkpoint.
