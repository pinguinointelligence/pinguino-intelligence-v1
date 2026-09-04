# SCAN IMPORT 2.0 — implementation status (2026-09-05, branch `claude/scan-import-v2`, base origin/staging 3149f345)

## Flows
| flow | status | evidence |
|---|---|---|
| KNOWN PRODUCT | **COMPLETE** | pipeline + adapters; staging read proof (Hacendado/Łaciate/Alsace Lait → PR-ING-007173/007172/007174); guest RPC validated in rolled-back transactions |
| UNKNOWN PRODUCT lifecycle | **COMPLETE** — journey test (8 transitions) AND staging with real photographs: exact lookup (all four unknown) → research (real web facts with provenance) → label analysis → finalize refused by the profile authority with explicit reasons (`NUTRITION_FACT_REQUIRED:*` for Milka/HARIBO, `INGREDIENTS_EVIDENCE_REQUIRED` + `MISSING_*` for the water, `identity required` for the can) → durable product request per candidate → a NEW session finds the same request (continuity true for 4/4). No product row was created because the authority did not allow one — D7 enforced with real evidence | `STAGING_LABEL_PROOF_2026-09-05.json`, `STAGING_DISCOVERY_PROOF_2026-09-05.json` |
| LABEL EVIDENCE | **COMPLETE — proven on staging with the owner's photographs (2026-09-05)**: Milka → "Milka Choco Mini Wafers"/Milka, HARIBO → "HARIBO favoritos Original"/HARIBO, Cabreiroá → "Agua mineral natural"/CABREIROÁ read from the labels; one visible label-vs-web category conflict (Milka); the Nestea photo was refused by the server burst limit, and a retry on the same session is blocked by an orphan asset row (legacy finding) — a fresh session carried it with code + web facts and no trusted identity | `STAGING_LABEL_PROOF_2026-09-05.json` |
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
EXTERNAL OWNER/DEPLOYMENT: (1) merge gate for PR #167 → migration 20260905090000 deployed → `SCAN_IMPORT_V2_GTIN_RPC=1` adapter run on staging and the harness on staging.pinguinoai.com (the flag `VITE_SCAN_IMPORT_LAB=1` is already set on the staging Vercel project for preview and production); (2) a closer photograph of a nutrition table if the owner wants a customer-provisional product created for Milka/HARIBO — the profile authority requires label-evidenced nutrition and the angled full-pack photos did not yield it (web nutrition is evidence, not label truth).
DEFERRED SCAN CORE: `toConfirmedScan()` helper and the rename of one of the two `ScanObservation` types — the shared contract + `fromScanCoreObservation` are sufficient; Scan Core stays at 0490b223 / PR #155 DRAFT / P1 probe pending.
DEFERRED HOME INTEGRATION: any HOME/PRO wiring, replacing the legacy scanner, live scanner navigation.

## Legacy findings from the real-photo run (not fixed here; separate Scan Import fix plan)
- `analysis_burst` refusal leaves an asset row on the session, and re-uploading the same photo then fails with `scan_asset_metadata_failed`: a retry after a burst refusal needs a fresh session.
- Finalize answers "not ready" and "confirm family" as HTTP 409 bodies with a `kind`; clients that treat any non-2xx as an exception (the legacy service does) lose the structured verdict. V2 consumes it.
- The single angled full-pack photo did not yield label-evidenced nutrition for Milka/HARIBO although the table is printed; the authority correctly refused (`NUTRITION_FACT_REQUIRED`). A second close-up photo is the intended path.

## Safety
No legacy file changed (diff vs staging: `src/scan-contract`, `src/scan-import-v2`, `src/pages/dev/ScanImportV2LabPage*`, two lines in `src/app/router.tsx`, one allow-list line in `authSecurity.test.ts`, one migration, `reports/scan-import-v2`). HOME untouched. Production/main untouched. Scan Core untouched. Staging writes made by proofs: one scan session, one lookup reservation, one product request (#32, SUBMITTED, home@home.com).

## Staging QA harness — hand-over state (2026-09-05)

- Route `/dev/scan-import-v2` is live on the branch preview of `claude/scan-import-v2` (Vercel project `pinguino-staging`, branch alias `pinguino-staging-git-5527b7-pinguinointelligence-7784s-projects.vercel.app`). The preview is SSO-protected; a 23-hour bypass link was generated with the Vercel tooling and handed to the owner. Verified in a browser: the page renders as guest, no console errors.
- `VITE_SCAN_IMPORT_LAB=1` is set on the staging Vercel project (preview + production) — no owner action needed. After PR #167 merges, the same page is reachable on the staging domain under `/dev/scan-import-v2`.
- Exact-identity authority is selected **explicitly** by a second policed flag: `VITE_SCAN_IMPORT_GTIN_RPC=1` → dedicated guest-safe RPC `resolve_exact_products_by_gtin_v1` (migration `20260905090000`, part of this PR, not yet applied on staging); otherwise the interim search authority. The page states which one is active. There is no silent fallback between the two paths. Consequence until the migration is applied: guests see known products as *unknown* (the search RPC is not guest-visible); signed-in accounts get the full known flow.
- Order of operations after merge (all internal, none requires the owner to touch Vercel): (1) migration applied on staging through the migration workflow, (2) `VITE_SCAN_IMPORT_GTIN_RPC=1` set on the staging project, (3) redeploy, (4) guest exact lookup re-verified on the harness.
- Branch reconciled with `origin/staging` 349bfb12 (PR #170) by a normal merge; the merge touched only `recipeStore.ts` and its Crown test — no V2 file.
