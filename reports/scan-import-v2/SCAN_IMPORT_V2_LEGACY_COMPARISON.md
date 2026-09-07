# Scan Import Legacy vs Scan Import 2.0 — comparison (diagnostic; legacy disagreement ≠ V2 wrong)

Harness: `src/scan-import-v2/legacyComparison.ts` (`compareWithLegacy`) runs the legacy pure pieces read-only (`validateBarcode`, `exactBarcodeMatch`, `routeScan`) beside V2 for the same confirmed code; exercised in `e2e.scanCore.test.ts`.

| dimension | Legacy (staging e2e1a61a) | Scan Import 2.0 (1467458b) | evidence |
|---|---|---|---|
| input | bare digit string (+ decoder hint used only for UPC-E) | `ConfirmedScan` with actual symbology, confirmation lane, evidence, timing, provenance | audit §1, §2; contract package |
| symbology | re-derived from digit length after validation (client + server) | taken from Scan Core, validated against length; mismatch = `invalid_code` | audit §2; codeIdentity |
| invalid checksum | collapsed into "no barcode" | `invalid_code { reason: 'checksum' }` | audit F15.1 |
| exact identity | client `rows.find` over ranked search; server `product_variants` only | one `exactByKeys` over all lookup keys; strength order; AMBIGUOUS on ties | audit F4.1, F4.2, F4.3 |
| EAN twins (private vs shared) | search ranking decides | strength decides; equal strength → preferred exact SKU → same-country default/fallback → AMBIGUOUS | D1, D2 |
| unknown code | ean_lookup → analyze_label → request_evidence → estimate | `unknown { next: 'analyze_label', externalEvidence?, evidenceError? }` — the legacy evidence flow stays the owner of profiling | pipeline |
| external evidence | merged into the session result by source rank; research call had no timeout | retained verbatim, never a product, pipeline-bounded timeout, malformed ignored | audit F5.1; tests 13–15 |
| country | `products.country` from label origin; picker authorities not consulted by the scanner | context country from the account authority; slot authorities consulted only to disambiguate exact ties; foreign assignments never used | audit §9; D1; test 11 |
| generic mapping | never as identity; behaviour family-derived at finalize | no `resolved_generic` variant at all; behaviour from the authority port | D3 |
| ProductBehaviour | `validateProductBehaviorAuthority` inside finalize | same authority behind a port; non-classified → `needs_confirmation` | audit §11; test 19 |
| price | overlay only; never blocks | `PriceState` on the result; never blocks | audit §12; test 20 |
| persistence / dedup | session + idempotency key + central EAN + account link | same semantics behind `ImportPort` with a deterministic key; `created: false` on replay | audit §7; tests 16–18, 25 |
| offline | none (every resolution is a server call) | per-account cache of resolved products; honest `offline` otherwise | audit F10.1; tests 6–7 |
| network failure | deep scanner: `connection`; live sweep silent; EAN lookup marked done | `failed: connection` distinct from `unknown`; nothing marked "done" | audit F10.2, F10.3 |
| failure vocabulary | four vocabularies | one result union (`resolved_exact | needs_confirmation | ambiguous | unknown | invalid_code | offline | failed`) | audit §15 |
| guest | identify-live requires sign-in | read-only resolution of shared rows, no import | test 21 |

Observed on the real products (in-memory catalogue seeded with their EANs): legacy exact match and V2 exact identity agree for Hacendado, Łaciate and Alsace Lait; for the UPC-A fixture legacy validates `UPC_A` and V2 reports `unknown` (no catalogue row) — identical validity, identical lookup keys.

## Observed on staging (real adapter, 2026-09-04)
Legacy `lookupExactBarcode` and V2 use the same RPC for the exact path, so for the three seeded products both find the same canonical id. The difference is the server side: legacy `product-scan-analyze` reads `product_variants` only (all three have a current variant row, so they agree today), while V2 has no second path. A customer-added product without a variant row (audit F7.2) would differ: legacy server = not found, V2 = found through `eans[]`.

## Unknown product (2026-09-05)
| dimension | Legacy | Scan Import 2.0 |
|---|---|---|
| after "not in catalogue" | `ean_lookup` → label analysis → evidence request → estimate; the session is the only carrier; expires | same authorities, but the identity and every fact travel in a provenance ledger; seven explicit stages; a durable request candidate when the profile cannot complete |
| identity vs readiness | one finalize decides both | identity (exact SKU, provisional) and readiness (authority) are separate results: `discovered_exact` with `engineReady=false` is valid |
| conflicts | kept in `result.conflicts` (label retained) | surfaced as ledger conflicts with both values and the retained source on every state |
| continuity | session id per scan; re-scans start over | by code + account through the request read model and the exact authority (linked provisional) |
| guests | identify-live requires sign-in | read-only exact resolution (D8), no discovery |
