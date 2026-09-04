# SCAN IMPORT 2.0 — implementation status (2026-09-05, branch `claude/scan-import-v2`, base origin/staging 3149f345)

## Flows
| flow | status | evidence |
|---|---|---|
| KNOWN PRODUCT | **COMPLETE** | pipeline + adapters; staging read proof (Hacendado/Łaciate/Alsace Lait → PR-ING-007173/007172/007174); guest RPC validated in rolled-back transactions |
| UNKNOWN PRODUCT lifecycle | **COMPLETE** (journey test: 8 transitions, one identity, one SKU, one request) · staging: research + honest refusal + request #32 + continuity PROVEN; label analysis + provisional creation on staging need a real label photo (EXTERNAL) | `discovery/`, `journey.test.ts`, `STAGING_DISCOVERY_PROOF_2026-09-05.json` |
| LABEL EVIDENCE | COMPLETE in code and tests · **EXTERNAL INPUT REQUIRED** for the staging run: a real QA label photograph (the repository holds no label image; the one-photo live test sends no image) | `analyzeLabel` over `product-scan-analyze`; harness page accepts a photo |
| EXTERNAL EVIDENCE | COMPLETE (real flow through `ean_lookup` → `intimport-enrich`; three sources with per-field provenance on staging) | staging proof |
| PROVENANCE | COMPLETE — every fact: value · source · authority · time · confidence · contributing sources; conflicts with both values + retained source; ledger context gtin/symbology/session/time | `journey.test.ts` provenance audit |
| CONFLICT HANDLING | COMPLETE — label vs internet (label retained, both visible), provider A vs provider B (server rank decides the value, both contributors visible; the losing VALUE is not carried by the legacy payload — documented limitation), no readiness change from any conflict | `journey.test.ts` conflict cases |
| OFFLINE PERSISTENCE | COMPLETE — memory / Web Storage / IndexedDB stores; schema + TTL + version-pointer guards; account and guest namespaces; reload-safe; broken storage degrades to no cache | `offlinePersistence.test.ts` (7) |
| STAGING DEV HARNESS | COMPLETE — `/dev/scan-import-v2` (dev, or staging with `VITE_SCAN_IMPORT_LAB=1`): typed code or Scan Core fixture observation → contract → V2 with real adapters; label photo, family, request steps; plain-language outcomes; boundary test | `src/pages/dev/ScanImportV2LabPage.tsx` |
| GUEST RPC (D8) | CODE COMPLETE (migration in PR) · ROLLED-BACK STAGING VALIDATION YES · LIVE DEPLOYED NO — **EXTERNAL / OWNER MERGE GATE** | `20260905090000_scan_import_v2_exact_gtin_resolver.sql` |
| CANONICAL AUTO-CREATION FROM CODE (D7) | NO — enforced (finalize authority path or product request only) | discovery tests |

## Tests (current)
`npx vitest run src/scan-import-v2 src/pages/dev/ScanImportV2LabPage.security.test.ts src/features/auth/authSecurity.test.ts` → 181 passed, 2 flag-gated skipped. V2 alone: 10 files, 162 passed + 2 skipped. With flags: staging read 11/11, staging discovery 11/11. `tsc --noEmit` clean; eslint clean for V2 files (one pre-existing react-refresh warning in `src/app/router.tsx` line 68, unrelated).

## Step 11 matrix
KNOWN: [x] exact EAN · [x] UPC (UPC-A + UPC-E expansion) · [x] EAN-8 · [x] ambiguous twins · [x] ProductBehaviour classified · [x] ProductBehaviour review · [x] missing price · [x] idempotent link · [x] persistent offline known (reload-safe) · [x] offline unknown
UNKNOWN: [x] valid unknown GTIN · [x] external evidence · [~] label evidence (code + tests; staging run externally blocked on a real photo) · [x] evidence conflict (label/internet, provider/provider) · [x] request/candidate persistence · [x] rescan continuity · [x] later completion continuity · [x] no generic collapse · [x] Engine-ready false until authority · [x] duplicate prevention
SECURITY: [x] guest public-only · [x] private product hidden · [x] account isolation (cache + RPC) · [x] no guest writes · [x] provider data not canonical by itself
PARITY: [x] browser/server exact identity (same authority, same JWT scope) · [x] Scan Core boundary preserved (contract package with zero imports; purity test)

## Remaining, classified
INTERNAL COMPLETE: known flow, unknown lifecycle, provenance, conflicts, offline persistence, harness, guest RPC code, docs.
EXTERNAL OWNER/DEPLOYMENT: (1) real QA label photograph → staging label analysis + provisional creation run (harness ready); (2) merge gate for PR #167 → migration 20260905090000 deployed → `SCAN_IMPORT_V2_GTIN_RPC=1` adapter run on staging; (3) `VITE_SCAN_IMPORT_LAB=1` in the staging environment to expose the harness for owner QA.
DEFERRED SCAN CORE: `toConfirmedScan()` helper and the rename of one of the two `ScanObservation` types — the shared contract + `fromScanCoreObservation` are sufficient; Scan Core stays at 0490b223 / PR #155 DRAFT / P1 probe pending.
DEFERRED HOME INTEGRATION: any HOME/PRO wiring, replacing the legacy scanner, live scanner navigation.

## Safety
No legacy file changed (diff vs staging: `src/scan-contract`, `src/scan-import-v2`, `src/pages/dev/ScanImportV2LabPage*`, two lines in `src/app/router.tsx`, one allow-list line in `authSecurity.test.ts`, one migration, `reports/scan-import-v2`). HOME untouched. Production/main untouched. Scan Core untouched. Staging writes made by proofs: one scan session, one lookup reservation, one product request (#32, SUBMITTED, home@home.com).
