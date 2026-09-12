# Scan Import 2.0 — staging integration record (2026-09-05)

Owner authorization: **SCAN IMPORT ACCEPTED — INTEGRATE** (after an earlier STOP, both on 2026-09-05).

## Identity
| Item | Value |
| --- | --- |
| PR | #167 (normal merge, undrafted for the merge) |
| Staging before | `4397e18458e85115cb82c9b2775a53c1229aa135` |
| Branch head merged | `65fec1b3936ecabfaa36e573be54438a88589f03` (CI: all 4 jobs green) |
| **Merge commit / current staging** | `5324f3751a69e3edb39926340d19442149a0d025` (parents 4397e184 + 65fec1b3; 42 files, +7885, −0) |
| Migration | `20260905090000_scan_import_v2_exact_gtin_resolver.sql` applied through the canonical runner (Supabase management `apply_migration`, name `scan_import_v2_exact_gtin_resolver`, server-stamped register version `20260905063617`; 219 rows in the register) |
| RPC | `public.resolve_exact_products_by_gtin_v1(text,text)` — exists, SECURITY DEFINER, STABLE, EXECUTE for anon + authenticated |
| Vercel (staging project only) | `VITE_SCAN_IMPORT_LAB=1` (Production + Preview, pre-existing), `VITE_SCAN_IMPORT_GTIN_RPC=1` (Production, added). Production project `pinguino-intelligence`: no `VITE_SCAN_*` variable |
| Deployment | `dpl_2UoyhWpX2o3FtSPoN55Kia4jCQ2e` (redeploy of the merge build `dpl_AKTMTp5Sg5SmxkG8ETpsjnUgcTq1`, commit 5324f375, target production, aliases `staging.pinguinoai.com`) |
| Served bundle | `/assets/index-BI512kN8.js` — carries the harness, the `resolve_exact_products_by_gtin_v1` call, the `gtin_rpc` selector and the "dedykowany (gtin)" authority text |
| Harness | https://staging.pinguinoai.com/dev/scan-import-v2 |

## RPC contract on live staging (SQL, role-emulated)
- anon: Hacendado / Łaciate / Alsace → 1 row each (`commercial_product|public|shared`, engine_usable true); unknown UPC-A, unknown EAN-13, invalid checksum, symbology mismatch, malformed input → 0 rows; no symbology → 1 row; the four real-photo GTINs → 0 rows (no product exists — D7 holds).
- authenticated (home@): known → 1 row; unknown → 0.
- owner leak test (pro@): a private `customer_provisional|internal` product is returned to its owner as `own` and is **not** returned to anon (0 rows); shared commercial rows are `own` for the owner and `public` for anon.
- duplicate-GTIN tie: **N/A ON CURRENT LIVE STAGING DATA** (no active product shares a real GTIN). The deterministic regression stays in the unit suite (`resolver` → AMBIGUOUS on a strength tie).

## Programmatic acceptance on the merged tree (`staging.merged.test.ts`, proof `STAGING_MERGED_ACCEPTANCE_2026-09-05.json`)
- A known (signed-in home@): 3/3 `resolved_exact`, `canonical_shared`, provenance `catalog`, behaviour `classified` with binding ids; repeat resolves the same identity.
- A guest RPC: 3/3 `resolved_exact` with the same product ids; unknown UPC-A → `unknown`; wrong checksum → `invalid_code`.
- B rescan continuity (no research spent): Milka, HARIBO, Cabreiroá, Nestea → `discovery_requested` with the SAME request ids as the real-photo proof (c63c2935, 2ce135f0, 58d93b61, 723cd9a5), status SUBMITTED, canonical false, engineReady false.
- C offline: cached identity served with provenance `local_cache`; uncached code → `offline`.
- `staging.adapter.test.ts` with `SCAN_IMPORT_V2_GTIN_RPC=1`: green (guest → `resolved_exact`).

## Browser acceptance on https://staging.pinguinoai.com/dev/scan-import-v2 (served bundle)
| Check | Signed-in (pro@) | Guest |
| --- | --- | --- |
| page renders, authority text "dedykowany (gtin)" | PASS | PASS |
| known Hacendado | PASS (catalog, engine ready, "powiązany") | PASS (catalog, "gość — tylko odczyt") |
| unknown UPC-A | PASS (research → facts 3, conflicts 0, label step offered) | PASS ("Nieznany kod", sign-in needed) |
| offline simulation | PASS ("pamięć podręczna (offline)", no write) | PASS |
| wrong checksum | PASS ("Nieprawidłowy kod, checksum") | PASS |
| console | 1 pre-existing app-shell 401 (also on the home page) | 5 pre-existing app-shell 401s at page load; harness actions add none |

## No duplicates (SQL after all runs)
- products per real-photo GTIN: 0 / 0 / 0 / 0; known GTINs: 1 each.
- product requests per real-photo GTIN: exactly 1 (home@), none by pro@; the browser research on the UPC-A code created no request.
- `user_product_relations` pro@ ↔ Hacendado: 1 row after repeated links (idempotent upsert).

## Gates on the final SHA 5324f375
- PR head 65fec1b3 CI: Owner-locked PASS, Solver contracts PASS, Starter-pack Direction rescue PASS, Typecheck/lint/tests/build PASS (12m46s).
- Local on 5324f375: typecheck clean; lint 0 errors (7 pre-existing warnings, one `react-refresh` warning in router.tsx from the gated route export); V2 + contract + boundary + owner-locked suites 33 files / 376 passed / 4 skipped; build OK.
- Staging CI run 33950226095 on 5324f375: **PASS** — Owner-locked (1m57s), Solver contracts (49s), Starter-pack Direction rescue (8m09s), Typecheck/lint/tests/build (19m15s).
- Cleanup: the temporary branch-scoped Preview values (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for `claude/scan-import-v2`) were removed after readiness; the staging Production values are untouched.

## Boundaries
Scan Core, HOME scanner, Mapper, Engine, production/main: untouched (merge diff limited to `src/scan-import-v2/**`, `src/scan-contract`, `src/services/scanImportV2.ts`, the gated dev page, the router gate, the auth allow-list, the migration, reports).

## Notes
- `search_products_v1` also appears in the page's network log: it is called by the app shell (`src/services/globalCatalog.ts`), not by the V2 exact path — under `gtin_rpc` the adapter never calls the search RPC.
- The browser guest proof was produced by clearing the harness browser's own persisted staging session; the owner signs in normally.
