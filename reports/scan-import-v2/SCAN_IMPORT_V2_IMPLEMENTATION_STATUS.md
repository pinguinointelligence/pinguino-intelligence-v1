# SCAN IMPORT 2.0 — implementation status (2026-09-05, branch `claude/scan-import-v2`, base origin/staging 3149f345)

## Flows (owner definition of done)
| flow | status | evidence |
|---|---|---|
| KNOWN PRODUCT: confirmed code → exact SKU → canonical relations → readiness → persistence/idempotency | **COMPLETE** | pipeline + adapters; staging read proof (Hacendado/Łaciate/Alsace Lait → PR-ING-007173/007172/007174); guest RPC validated in rolled-back transactions |
| UNKNOWN PRODUCT: confirmed unknown code → identity preserved → real evidence collection → catalogue lifecycle → truthful incomplete state → canonical technical authority → same identity later → no fabricated readiness | **COMPLETE as a lifecycle; PARTIAL in staging coverage** | `discovery/` + fake port: 13 acceptance tests (label + internet evidence, conflicts, not-ready, created SKU with engineReady=false, later completion, rescan continuity, request continuity); staging: research + finalize refusal + request #32 + rescan continuity PROVEN; label analysis and a real customer-provisional creation NOT run on staging (no label photograph available in this session) |
| LABEL EVIDENCE | COMPLETE (design + adapter + tests) · PARTIAL (staging run pending a real label photo) | `analyzeLabel` over `product-scan-analyze`; ledger provenance `label`; conflict test |
| EXTERNAL EVIDENCE | COMPLETE (real flow through `ean_lookup` → `intimport-enrich`) | staging: three sources with per-field provenance for 4305615614434 |
| PRODUCT CATALOG / LIVE OVERLAY LIFECYCLE | COMPLETE for the existing lifecycle objects (scan session → customer-provisional product → request → admin verification); no new authority | D10; staging request #32 |
| PRODUCTBEHAVIOUR | COMPLETE (authority-only) | finalize path + behaviour port; engineReady never invented |
| ENGINE-READINESS GATING | COMPLETE | `engineReady` only from `engineUsable`/authority; `needs_confirmation(behaviour_review)` on rescan until the authority classifies |
| OFFLINE | COMPLETE (cache) · PARTIAL (memory backend; IndexedDB adapter pending) | tests 6/7 + guest offline |
| IDENTITY / DEDUP | COMPLETE | central EAN identity, link-only import, request idempotency key, continuity tests |
| PROVENANCE | COMPLETE | ledger per fact + conflicts; request provenance on staging |
| GUEST EXACT RESOLUTION (D8) | COMPLETE (RPC migration in this PR; adapter default) · applies on staging after the migration is deployed through the normal workflow | migration `20260905090000`; six D8 stub tests; staging SQL validation |
| CANONICAL AUTO-CREATION FROM CODE (D7) | NO — enforced (finalize path only; request otherwise) | discovery tests 1, 3, 4, 5 |

## Tests
`npx vitest run src/scan-import-v2` → 8 files, 130 passed, 2 flag-gated skipped (staging read, staging discovery). With flags: staging read 11/11 (search authority; gtin authority after migration), staging discovery 11/11. `tsc --noEmit` clean, eslint clean.

## Remaining gaps (exact)
1. Label analysis on staging with a real label photograph, then a real customer-provisional creation through finalize (the code path exists and is unit-tested; the staging run needs an owner photo or a QA label image).
2. `SCAN_IMPORT_V2_GTIN_RPC` staging adapter run after migration `20260905090000` is applied by the normal workflow (function proven in rolled-back transactions; adapter proven with stubs).
3. IndexedDB backend for the offline cache (memory backend today).
4. A staging-only, flag-gated dev page: Scan Core harness → `fromScanCoreObservation` → V2 with real adapters (owner QA). HOME untouched.
5. Scan Core contract-only change on its branch (`toConfirmedScan()`), rename one `ScanObservation`.

## Safety
No legacy file changed; HOME untouched; production/main untouched; Scan Core untouched (0490b223). Staging writes made by the discovery proof: one scan session, one lookup reservation, one product request (#32, SUBMITTED, QA account home@home.com) — all test data in the canonical lifecycle, cancellable by admin.
