# SCAN IMPORT 2.0 — implementation status (2026-09-04 evening, branch `claude/scan-import-v2`, base origin/staging 3149f345 merged)

STATUS: **SCAN IMPORT 2.0 ADAPTER LAYER INTERNALLY COMPLETE for the read path; import is LINK-ONLY; not wired to any UI; DRAFT PR; not OWNER ACCEPTED.**

## Implemented (new files only; legacy Scan Import, HOME, production untouched)
- Pure module (contracts, code identity, resolver, pipeline, legacy comparison) — see the architecture doc; 45 pure tests.
- `adapters/supabaseAdapters.ts`: catalogue + behaviour + price over ONE `search_products_v1` exact path (memoised row), preferences over the two slot RPCs, link-only import over `user_product_relations`, offline cache with TTL + version pointer. Stub-client tests: 9. Flag-gated staging test: 1 (11 assertions), run read-only against staging as `home@home.com` — proof file committed.
- Reconciliation: origin/staging 3149f345 merged (PR #163/#164/#165: canonical country product resolution, rescue terminal authority, PRO settings) — pure baseline unchanged 45/45; no contract incompatibility.

## Test results (current)
`npx vitest run src/scan-import-v2` → 5 files, 74 passed, 1 skipped (the staging test without the flag). With the flag: staging test 11/11. `tsc --noEmit` clean, eslint clean.

## Real staging results (read-only)
| product | EAN | result | canonical id | product code | visibility/strength | country | ProductBehaviour | price |
|---|---|---|---|---|---|---|---|---|
| Hacendado | 8402001047251 | FOUND · resolved_exact | 50c3d0e1-ca37-4891-a744-a3438d6b226a | PR-ING-007173 | shared · canonical_shared · commercial_product | ES | classified (version 44d44d53…) | missing |
| Łaciate | 5900820012434 | FOUND · resolved_exact | 8fc7869c-f779-43c6-b5e6-c25a845f7c0e | PR-ING-007172 | shared · canonical_shared · commercial_product | PL | classified | missing |
| Alsace Lait | 3262970109108 | FOUND · resolved_exact | db21c569-6427-4457-b1ae-6952a48f75ac | PR-ING-007174 | shared · canonical_shared · commercial_product | FR | classified | missing |
Unknown 4305615614434 → `unknown`. Guest → `unknown` (explicit scope). Direct `products`/`product_variants` reads as the QA account → 0 rows (RLS).

## Not done / next steps
1. `resolve_exact_products_by_code_v1` RPC (migration in a PR, validated in a rolled-back transaction, never applied by hand) exposing visibility, ownership, active state, version, twins evidence → removes the `private_own` limit and gives guests a deliberate read-only exact path if the owner wants one.
2. Import of NEW products from a confirmed code (owner decision: allow `gellatti_upsert_customer_added_product_v1` without an analysed session, or keep the legacy evidence flow as the only creator).
3. Staging WRITE proof for the link-only import (behind `SCAN_IMPORT_V2_STAGING_WRITE=1`), then a flag-gated staging dev page: Scan Core harness → `fromScanCoreObservation` → V2 with real adapters, for owner QA. No HOME change.
4. Scan Core contract-only change on its own branch (`toConfirmedScan()`), rename one `ScanObservation`.
5. External-evidence adapter over `intimport-enrich` with `AbortSignal` (the pipeline timeout already bounds it).

## Safety
No legacy file changed (diff vs staging: `src/scan-contract`, `src/scan-import-v2`, `reports/scan-import-v2` only). HOME untouched. Production/main untouched. Staging DB not modified (read-only proof; the link upsert was recorded, not executed).
