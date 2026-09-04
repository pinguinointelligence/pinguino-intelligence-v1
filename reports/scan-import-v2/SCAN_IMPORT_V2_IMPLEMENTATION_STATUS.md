# SCAN IMPORT 2.0 — implementation status (2026-09-04, branch `claude/scan-import-v2` @ 1467458b, base origin/staging e2e1a61a)

STATUS: **SCAN IMPORT 2.0 INTERNALLY COMPLETE (pure module + tests); NOT wired; adapters PENDING.** Not OWNER ACCEPTED.

## Implemented (all new files; nothing legacy modified)
- `src/scan-contract/confirmedScan.ts` — shared contract package: `ConfirmedScan`, `ScanCoreObservationLike`, `fromScanCoreObservation` (no imports at all).
- `src/scan-import-v2/contracts.ts` — `CodeIdentity`, `ExactCandidate` + identity strength, `RequestContext`, ports (`CatalogPort`, `PreferencePort`, `BehaviourPort`, `ExternalEvidencePort`, `ImportPort`, `OfflineCachePort`, `PricePort`), `ScanImportV2Result` union.
- `src/scan-import-v2/codeIdentity.ts` — validation with the actual symbology (charset, length per symbology, GTIN check digit, UPC-E expansion, leading-zero lookup keys, GTIN-13 canonical form).
- `src/scan-import-v2/resolver.ts` — exact resolution + the audited precedence (D1/D2).
- `src/scan-import-v2/pipeline.ts` — `runScanImportV2` (identity → offline/cache → resolution → external evidence with timeout → behaviour authority → price state → idempotent import → result).
- `src/scan-import-v2/legacyComparison.ts` — diagnostic harness.
- `src/scan-import-v2/__fixtures__/scanCoreObservations.json` — real observations dumped from the Scan Core engine (claude/scan-core-phase-0 @ 0490b223) for Hacendado, Łaciate, Alsace Lait and a UPC-A code.
- Tests: `codeIdentity.test.ts` (10), `pipeline.test.ts` (32), `e2e.scanCore.test.ts` (3) — 45 passing; `tsc --noEmit` clean; eslint clean.

## Not implemented (NEXT STEPS, in order)
1. Supabase adapters for the ports (read-only first): `CatalogPort` over one exact-by-EAN RPC (`products.ean_code_normalized ∪ product_variants.ean`, with visibility/link facts) — this is also the fix for audit F4.2/F7.2; `PreferencePort` over `get_user_preferred_product_for_slot_v1` + `resolve_country_product_slots_v1`; `BehaviourPort` over the finalize-side authority (or the `classify_catalog_product_behavior_v2` result on the product); `PricePort` over `user_product_relations`; `ImportPort` over `gellatti_upsert_customer_added_product_v1` (needs a scan-session equivalent or a V2-specific RPC — owner decision on whether V2 may create a `product_scan_sessions` row without an analysis); `OfflineCachePort` over IndexedDB per account.
2. A staging-only dev page (flag-gated, no HOME change) that runs Scan Core (harness) → V2 with the real adapters for owner QA.
3. Scan Core contract-only change on `claude/scan-core-phase-0`: export `toConfirmedScan()` (or adopt `src/scan-contract`) so the harness can emit the contract type directly; rename one of the two `ScanObservation` types (boundary doc).
4. Owner decisions: activation of HOME/PRO wiring (explicitly not done), whether V2 may import a product from a confirmed code without label profiling (today V2 returns `unknown → analyze_label`, i.e. the legacy evidence flow remains the profiler).

## Safety
Legacy Scan Import unchanged (git diff against origin/staging touches only `src/scan-contract`, `src/scan-import-v2`, `reports/scan-import-v2`). HOME untouched. Production/main untouched. No PR opened.
