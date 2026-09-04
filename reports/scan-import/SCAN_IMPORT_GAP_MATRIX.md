# SCAN IMPORT — GAP MATRIX (staging e2e1a61a, 2026-09-04)

Status vocabulary: COMPLETE · PARTIAL · MISSING · REGRESSED · DESIGNED_ONLY · DEFERRED. Severity: P0 identity corruption / security / wrong canonical product · P1 major reliability / persistence / precedence · P2 UX / failure clarity · P3 optional. Details and evidence: `SCAN_IMPORT_FORENSIC_AUDIT.md` (section numbers in the first column).

| § | capability | status | severity of the gap | findings |
|---|---|---|---|---|
| 1 | one named "Scan Import" module | PARTIAL — three named parts (Product Scanner, LIVE SCANNER, Product Intelligence / INTIMPORT) sharing authorities | P3 | naming only |
| 2 | EAN-13 / EAN-8 / UPC-A identity | COMPLETE (client) · PARTIAL (server symbology by length) | P2 | F2 (see §2 verdict) |
| 2 | UPC-E identity | PARTIAL — client expands; server misclassifies an 8-digit UPC-E value | P2 | §2 |
| 2 | QR | DESIGNED_ONLY? — no: NOT SUPPORTED BY CONTRACT (no design either) | — | — |
| 2 | decoder symbology preserved end-to-end | MISSING (re-derived from length after validation) | P2 | §2 |
| 2 | invalid checksum surfaced | MISSING (collapsed into no-code) | P2 | F15.1 |
| 3 | explicit resolution precedence | COMPLETE (`routeScan`, tested) | — | — |
| 3 | stronger exact beats weaker generic within a session | COMPLETE | — | — |
| 4 | unique exact identity across visibility layers | REGRESSED-BY-DESIGN — EAN twins (private/provisional vs shared) resolved by search ranking on the client | **P1** | F4.1 |
| 4 | client/server exact lookups agree | PARTIAL (client `eans[]`, server `product_variants` only) | **P1** | F4.2, F7.2 |
| 4 | AMBIGUOUS state | MISSING | P2 | F4.3, F15.2 |
| 5 | provider trust model (evidence, not authority) | COMPLETE | — | — |
| 5 | research call timeout | MISSING | **P1** | F5.1 |
| 5 | network failure vs "not found" distinction (EAN lookup) | MISSING | P2 | F5.2, F10.3 |
| 5 | Open Food Facts on the scanner path | DEFERRED (exists only behind the OCR reviewer seam) | P3 | F5.3 |
| 6 | provenance per field + external sources + conflicts | COMPLETE | — | — |
| 6 | deterministic product confidence | COMPLETE | — | — |
| 6 | single confirmation-requirement output | PARTIAL (four overlapping signals) | P2 | F6.1 |
| 6 | exactness provenance recorded | PARTIAL | P2 | F6.2 |
| 7 | session ↔ barcode binding, idempotent finalize, central EAN identity | COMPLETE | — | — |
| 7 | rescan of a customer-added product hits the free path | PARTIAL (no variant row when the EAN slot is held historically) | **P1** | F7.2 |
| 7 | cross-channel identity (HOME sweep / deep / PRO picker / text import / manual) | PARTIAL; manual channel UNKNOWN | P2 | F7.1, F7.3 |
| 8 | Product Catalog (versions, superseding, variants) | COMPLETE | — | — |
| 8 | user overlay (price/favorite/supplier/stock) | COMPLETE and non-authoritative | — | F8.1 naming |
| 8 | Live Overlay engine identity | DESIGNED_ONLY / RETIRED | — | — |
| 8 | post-finalize identity editing by the customer | MISSING | P2 | F8.2 |
| 9 | product country decoupled from UI language | COMPLETE | — | F9.1, F9.2 (P3) |
| 10 | known product resolves offline | MISSING | **P1** | F10.1 |
| 10 | honest unknown/offline state | COMPLETE (deep) · PARTIAL (live silent) | P2 | F10.2 |
| 11 | ProductBehaviour through the canonical authority | COMPLETE | — | F11.1, F11.2 (P3) |
| 12 | missing price = costing incompleteness only | COMPLETE | — | F12.1, F12.2 (P3) |
| 13 | identity stable import → recipe → save → reopen → version | COMPLETE (historical authority) | — | F13.1 (verify), F13.2 |
| 14 | untrusted input boundaries | COMPLETE | — | F14.1, F14.2 |
| 15 | failure vocabulary maps to owner states | PARTIAL (INVALID_CODE, AMBIGUOUS, live NETWORK missing) | P2 | F15.1–F15.4 |
| — | Scan Core ↔ Scan Import coupling | NONE on staging; de-facto input = a bare digit string | — | `SCAN_IMPORT_BOUNDARY.md` |

**P0: none found.** No identity corruption, no security bypass, no wrong canonical product *within a clean catalogue*; the P1 items are the conditions under which the catalogue is not clean (EAN twins) or the two exact lookups disagree.
