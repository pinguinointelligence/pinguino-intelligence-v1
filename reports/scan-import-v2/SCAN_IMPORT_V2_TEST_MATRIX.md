# SCAN IMPORT 2.0 — test matrix (owner list) → `npx vitest run src/scan-import-v2` = 10 files, 162 passed + 2 flag-gated (staging) @ 315413f8; plus harness boundary (5) and env allow-list

| # | case | test (file: name) | result |
|---|---|---|---|
| 1 | known exact EAN | pipeline: `1/22. known exact EAN (authenticated)…`; codeIdentity: `1. known exact EAN-13…` | PASS |
| 2 | known exact UPC | pipeline: `2. known exact UPC-A resolves through its zero-padded key…`; codeIdentity: `2. known exact UPC-A…UPC-E expands` | PASS |
| 3 | invalid checksum | codeIdentity: `3. invalid checksum is INVALID_CODE…`; pipeline `3/4.` (catalogue never called) | PASS |
| 4 | malformed code | codeIdentity: `4. malformed codes are rejected with the specific reason` (charset, symbology_mismatch, length, unsupported_symbology, not_confirmed) | PASS |
| 5 | unknown code | pipeline: `5. unknown code is honest UNKNOWN…` | PASS |
| 6 | offline known | pipeline: `6/7. offline…` (local_cache, importSkipped offline) | PASS |
| 7 | offline unknown | same test (`kind: 'offline'`); online network failure → `failed: connection` | PASS |
| 8 | exact SKU beats generic | pipeline: `8.` (commercial beats Mapper reference for the same EAN) + `8b.` (Mapper-only match is still exact) | PASS |
| 9 | preferred user SKU | pipeline: `9. EAN twins at the same strength: the user preferred exact SKU decides` | PASS |
| 10 | country default | pipeline: `10. otherwise the approved country default…` | PASS |
| 11 | foreign fallback prohibited | pipeline: `11. a foreign country assignment is never used…` → AMBIGUOUS | PASS |
| 12 | ambiguity | pipeline: `12. ambiguity is reported with the candidates…` | PASS |
| 13 | external provider conflict | pipeline: `13. conflicting external evidence is retained verbatim…` | PASS |
| 14 | provider timeout | pipeline: `14. provider timeout is bounded by the pipeline…` | PASS |
| 15 | provider malformed response | pipeline: `15. malformed provider response is ignored…` | PASS |
| 16 | repeated observation idempotency | pipeline: `16/17/18/25.` (same key, `created: false`, one central product) | PASS |
| 17 | reload idempotency | same test (`now` differs, key identical) | PASS |
| 18 | duplicate prevention | same test (`central.size === 1`) | PASS |
| 19 | ProductBehaviour missing | pipeline: `19.` (`needs_confirmation` behaviour_review / behaviour_blocked, no import) | PASS |
| 20 | missing price | pipeline: `20.` (`price.state = 'missing'` on a resolved product) | PASS |
| 21 | guest | pipeline: `21.` (read-only, `importSkipped: 'guest'`, provisional invisible) | PASS |
| 22 | authenticated user | pipeline: `1/22.` | PASS |
| 23 | Product Country persistence | pipeline: `23.` (identity independent of context country; row keeps its own country) | PASS |
| 24 | HOME/PRO-independent identity | pipeline: `24.` | PASS |
| 25 | same barcode across sessions | pipeline: `16/17/18/25.` | PASS |
| 26 | actual decoder symbology preserved | codeIdentity: `26.` (EAN-8 vs UPC-E for the same 8 digits) + e2e (UPC-A fixture keeps UPC-A) | PASS |
| — | import persistence failure | pipeline: `import persistence failure is IMPORT_FAILED…` | PASS |
| — | legacy parity of validation | codeIdentity: `legacy parity…` (read-only comparison with `validateBarcode`) | PASS |
| — | real products end to end | e2e: `resolves the three real products from real Scan Core observations` (Hacendado 8402001047251, Łaciate 5900820012434, Alsace Lait 3262970109108) | PASS |
| — | boundary purity | e2e: `Scan Core observations carry no product data; Scan Import 2.0 imports nothing from the camera side` | PASS |

Not covered here (needs real adapters): Supabase-backed ports, the HOME/PRO wiring (deliberately not built), RLS behaviour of the real catalogue port.

## Adapter layer additions
| case | test | result |
|---|---|---|
| real staging row shape → exact candidate + end-to-end resolution | adapters: `maps the real staging row shape…` | PASS |
| name/alias RPC hit is not an identity | adapters: `an RPC row matched by name/alias but not by EAN is not an identity` | PASS |
| UPC-A both keys on one path | adapters: `UPC-A tries both keys on the same path…` | PASS |
| guest scope explicit | adapters: `guest has no exact path…` | PASS |
| connection vs lookup_failed | adapters: `network failure on the RPC is failed:connection…` | PASS |
| behaviour blocked / review; price overlay | adapters: `behaviour: lifecycleRejected → blocked…` | PASS |
| EAN twins → preferred → same-country default → ambiguous | adapters: `EAN twins at equal strength…` | PASS |
| link import idempotent, never creates | adapters: `link import is idempotent…` | PASS |
| offline cache TTL + version pointer | adapters: `offline cache: entries expire by TTL…` | PASS |
| REAL STAGING (flag-gated, read-only) | staging: `resolves the three real products…` | PASS 11/11 (2026-09-04) |

## Unknown-product acceptance (discovery.test.ts + staging.discovery.test.ts)
| acceptance row | test | result |
|---|---|---|
| UNKNOWN VALID GTIN: discovery starts, no placeholder dead end | `UNKNOWN VALID GTIN…` | PASS (+ staging: session ed9d0d48, request #32) |
| UNKNOWN + LABEL EVIDENCE contributes to the same identity | `UNKNOWN + LABEL EVIDENCE…` | PASS (fake port; staging pending a label photo) |
| UNKNOWN + INTERNET EVIDENCE contributes to the same identity | `UNKNOWN + INTERNET EVIDENCE…` | PASS (+ staging: 3 real sources with provenance) |
| LABEL / INTERNET CONFLICT: no silent winner | `LABEL / INTERNET CONFLICT…` | PASS |
| UNKNOWN WITHOUT ENOUGH TECHNICAL DATA: product preserved, not created, engineReady=false | `UNKNOWN WITHOUT ENOUGH TECHNICAL DATA…` | PASS (+ staging: finalize refused, 0 product rows) |
| NEW EXACT SKU through the authorities, engineReady only from the authority | `NEW EXACT SKU…` | PASS (fake) |
| LATER PROFILE COMPLETION → same product eligible | `RESCAN AFTER CREATION + LATER PROFILE COMPLETION…` | PASS |
| RESCAN AFTER COMPLETION: same product, no duplicate | same test (`created.size === 1`, one research) | PASS |
| DURABLE CANDIDATE across sessions | `DURABLE DISCOVERY CANDIDATE…` | PASS (+ staging: rescan → discovery_requested) |
| PROVIDER FINDS UNKNOWN GTIN → still not canonical | `EXTERNAL PROVIDER FINDS…` | PASS |
| PROVIDER TIMEOUT during discovery | `PROVIDER TIMEOUT during discovery…` | PASS |
| SERVER EXACT during discovery → exact, never new | `SERVER EXACT during discovery…` | PASS |
| GUEST unknown: no discovery | `GUEST unknown…` | PASS |
| EXACT BRANDED CODE never generic | `EXACT BRANDED CODE NEVER COLLAPSES…` | PASS |
| D8 guest resolver (6 tests) | adapters.test.ts `D8 — guest-safe exact resolver adapter` | PASS |
| discovery adapter contracts (6 tests) | discoveryAdapter.test.ts | PASS |

## Internal closeout additions
| case | test | result |
|---|---|---|
| lifecycle journey: 8 transitions, one identity, one SKU, one request | journey.test.ts `walks CONFIRMED CODE → … → rescan` | PASS |
| provenance audit per fact (value/source/authority/time/confidence/conflict) | journey.test.ts `every important fact answers…` | PASS |
| value without provenance is not a fact | journey.test.ts | PASS |
| provider A vs provider B conflict | journey.test.ts `provider A (retailer) vs provider B (manufacturer)…` | PASS |
| label X vs internet Y; confident provider never flips readiness | journey.test.ts | PASS |
| offline persistence: reload, expiry, schema, version mismatch, account/guest separation, no duplicates, broken storage | offlinePersistence.test.ts (7) | PASS |
| harness boundary (gate, route, imports, no raw HTML, V2 entry points only) | ScanImportV2LabPage.security.test.ts (5) | PASS |
