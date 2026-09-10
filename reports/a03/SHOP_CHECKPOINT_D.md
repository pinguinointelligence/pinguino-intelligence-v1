# SHOP checkpoint (d) — evidence preserved, selection handed to the Owner Excel (2026-09-10)

Owner scope correction D-22…D-27: the Owner's complete Excel is the only authority for country-base products; BAZA v7/v9 are
incomplete working examples. SHOP stopped all discovery aimed at choosing milk, cream, SMP, dextrose or stabilizer for a market.
Everything already found is kept as evidence and is never a selection. Every number below is computed from the CSVs in this folder.

## What stopped and what is kept
- The seven research agents still looking for products were stopped when the correction arrived; their partial results are kept.
- research_evidence_catalogue.csv — 118 researched products, all selection_status = NOT_SELECTED_AWAITING_OWNER_EXCEL:
  VERIFIED_MARKET_EVIDENCE 48 · VERIFIED_PRODUCT_EVIDENCE 16 · RESEARCH_LEAD 54.
  Verified market evidence by slot: STABILIZER 34 · DEXTROSE 9 · SMP 3 · CREAM 1 · MILK 1; stabilizer types: GUAR 14 · LBG 9 · STABILIZER_BLEND 7 · TARA 4.
  The same EAN verified in more than one market inside the research evidence: 3 — 5703137936819: DK/NO; 8588006139983: IT/PL; 8719265050966: BE/NL.
  Store-internal codes and failed checksums are typed and flagged: GTIN-13 (EAN-13) 56 · GTIN-12 (UPC-A) 12 · CHECKSUM_FAIL 2 · GTIN-14 2 · GTIN-8 1 · RCN_STORE_INTERNAL (not globally unique) 1 · NOT_A_GTIN_LENGTH 1.
- Products ALREADY listed in the working Excel that research verified (allowed by D-25): 3 — NO CREAM 7038010041914; NO MILK 7038010000065; AU SMP 9300639999005.
- pdf0_working_rows_v7.csv now holds working-Excel products only: CONFIRMED 125/375 (CORE 52/100); research never fills a row.

## Owner Excel reconciliation — ready
tooling/reconcile_owner_excel.py checks every row in 9 steps (PI in 2541, PR, identifier, market page, source, technical flags, role↔PI,
verdict, REPORT_BACK — never a substitution). Self-tests on the working files:
- v7 (450 rows): OK 368 · ISSUES 82 (no EAN 80 — the BRAK cells; brand missing 5; store-internal codes 2). Role↔PI vs 2541: 450/450 consistent.
- v9 STABILIZER sheet (75 rows): OK 50 · ISSUES 25; vs v7: SAME_PRODUCT 75. Role↔PI: 75/75.
  v9 renames the stabilizer position to the STABILIZER slot but lists the same products as v7.

## v9 "TARA_LOCAL_CONFIRMED" claims (15) checked with the A04 rule — report back, nothing replaced
| result | markets |
|---|---|
| MARKET_DOMAIN_PAGE_NAMES_TARA_NO_EAN | CA, PL, AR, CL, CZ, GR, LT, MY, SG |
| EAN_ON_NON_MARKET_PAGE | US, IT |
| NOT_READABLE_OR_UNPROVEN | BR, HK, TH |
| MARKETPLACE_ONLY | TR |
| EAN_VERIFIED_ON_MARKET_PAGE | — |

A local shop page that names tara shows local availability, but without the EAN on the page the exact product is not proven by the
A04 rule. Which bar the final verification uses is an owner decision (see below). Details: v9_local_tara_claims_check.csv.

## Sucrose — local consumer terms (selection-independent, D-25)
Retailer-printed term on a page serving the market: 28 markets — BD: চিনি; BG: Захар; BR: Açúcar Refinado; CZ: Cukr krystal; DK: Sukker; EE: Suhkur; EG: سكر ابيض; FI: Taloussokeri / strösocker; GR: Ζάχαρη Λευκή; HR: Šećer kristal; HU: Kristálycukor; ID: Gula Pasir; IS: sykur; JP: 上白糖; KR: 백설탕; LT: Cukrus; LV: Cukurs; NL: Kristalsuiker; NO: Sukker; PT: Açúcar Branco; RO: Zahăr alb; SE: Strösocker; SI: Beli kristalni sladkor; SK: Cukor kryštálový biely; TH: น้ำตาลทรายขาวบริสุทธิ์; TR: Toz Şeker; TW: 細砂糖; VN: Đường trắng.
SA10 everyday phrase already present: 44 markets. No evidence yet: CN, CY, IL. Editorial notes: JP 上白糖 is soft white sugar with a
little invert syrup (plain granulated = グラニュー糖); the IL term came from a price-comparison site, so it stays LEAD; CY in Greek and IL in
Arabic have no local page yet. These are evidence for editorial approval, not SHOP translations.

## Selection-independent deliverables
- tooling/ — verifier, quote checker, identifier typing, Owner-Excel reconciler, XLSX reader, README
- market_locale_structure_75.csv — 75 markets: locales (26 multi-locale), country domain, currency and whether it ties a page to one market
- VERIFICATION_CHECKLIST_75.csv — 450 rows (75 markets × 6 slots) × the 9 D-26 steps + Engine 10/10 + freeze, all pending the Owner Excel
- ENGINE_10_10_VALIDATION_PIPELINE.md — the D-27 chain mapped onto the app's engine and solver (read-only findings)
- PDF0_DATA_ARCHITECTURE.md — selection authority, evidence labels, identifier typing, final grams only after 10/10
- research_evidence_catalogue.csv / stabilizer_research_evidence_75.csv — all research kept as evidence

## Limits met this round
- The account hit a spend limit once; the agents resumed from their saved progress. The session's shared web-search budget (200 calls)
  was then used up, so late discovery ran on direct page fetches only.
- Bot walls and CAPTCHAs (Galaxus, Price Rite, Chemipan, GymBeam BG, Shufersal) were recorded as inconclusive, never bypassed.
- BAZA v8 (the TARA evidence behind v9) is not on this machine. The SA10 handoff workbook moved into MAPPER search concepts/history/.
