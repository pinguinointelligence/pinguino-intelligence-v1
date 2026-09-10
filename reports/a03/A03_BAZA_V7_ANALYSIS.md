# A03 — BAZA GELATO v7 × FINAL_FROZEN 2541 — deterministic analysis (2026-09-10)

Inputs: Desktop/PR WORLD/GELLATTI_BAZA_GELATO_75_KRAJOW_v7.xlsx (WORKING, NOT FINAL — owner D-7);
Desktop/MAPPER/mapper_basement.csv (FINAL_FROZEN 2541, field-identical to the sha-256 6db7fbe0… XLSX).
Offline only. Nothing written to the app, Mapper or database. Machine-readable outputs beside this file:
baza_v7_coverage_75x6.csv · baza_v7_multicountry_eans.csv · baza_v7_pi_refresh.csv

## Scope (recalculated on 75 — owner D-5)
- v7 country list: 75 unique ISO2 = the accepted 75-market set.
- catalog_market_countries (18) ⊂ 75: YES. shop_countries (17) ⊂ 75: YES.
- Routing gap on the 75 denominator: the catalog authority lacks **57 of 75** markets.
  (RECEPTURY blocker GEL001-B01 reported 231/249 on the ISO/world index; that index is not rewritten, only the
  active denominator changes.)
- Coverage matrix: 450 rows = 75 markets × 6 roles; no multi-EAN cells.

## PI identity (D-1, D-2)
- 6 PI used by v7, all present in FINAL 2541.
- Display-name refresh needed by stable ID (v7 was built on the live 2147 state — see 06_ZRODLA SRC-MAPPER):
  - PI-ING-000236  v7 "MILK 3.5% · Milk · Chilled"  → 2541 "MILK · 3.5% FAT · Chilled"
  - PI-ING-000270  v7 "SKIMMED MILK · Milk"         → 2541 "SKIMMED MILK POWDER · 0.8% FAT · Dairy · Dry"
  No PI is remapped because of a name change.

## EAN integrity (S4')
- 295 EAN cells, 186 unique EANs. All 295 stored as TEXT (no numeric cells → no leading-zero loss).
- GTIN mod-10 checksum: **295 / 295 OK**.
- GS1 restricted-circulation range (not globally unique — never usable as cross-market identity):
  - 2033200071103 — TH — TARA
  - 2055040011118 — TH — DEXTROSE

## v7 status matrix (provisional; nothing here is independently verified yet)
| role | v7 statuses |
|---|---|
| MILK | KANDYDAT_PR 74 · READY_PR 1 |
| CREAM | KANDYDAT_PR 70 · KANDYDAT_WARUNKOWY 3 · KANDYDAT_PI_ESTIMATED 2 |
| SMP | KANDYDAT_PR 58 · WYMAGA_GTIN 6 · WYMAGA_ETYKIETY 11 |
| SUCROSE | READY_PI 75 (global PI, D-8) |
| DEXTROSE | KANDYDAT_PR 16 · WYMAGA_GTIN 9 · WYMAGA_ETYKIETY 50 |
| TARA | KANDYDAT_PR 33 · WYMAGA_ETYKIETY 24 · WYMAGA_DOSTAWY 16 · WYMAGA_GTIN 1 · HOLD_US 1 |
By priority — ★★★★★ (20 markets): KANDYDAT_PR 78 · READY_PI 20 · WYMAGA_ETYKIETY 13 · WYMAGA_GTIN 7 ·
READY_PR 1 · HOLD_US 1. ★★★★ (55): KANDYDAT_PR 173 · READY_PI 55 · WYMAGA_ETYKIETY 72 · WYMAGA_DOSTAWY 16 ·
WYMAGA_GTIN 9 · KANDYDAT_WARUNKOWY 3 · KANDYDAT_PI_ESTIMATED 2.
D08 input: the WYMAGA_* rows (GTIN 16, ETYKIETY 85, DOSTAWY 16) are the exact missing-requirement list.

## Sources (heuristic domain classification — not a verdict)
Coverage-row source URLs: direct site (manufacturer or retailer, unclassified) 371 · no URL 75 (the sucrose
READY_PI rows) · marketplace 3 · aggregator 1.

## Multi-country EAN candidates for A04: 33
Largest: 8055728540170 SaporePuro tara (28) · 819543011967 Modernist Pantry tara (14) · 733739058324 NOW organic
non-fat dry milk (13) · 3412290032215 Paysan Breton cream 30% (9) · 5701215046375 Emborg whipping cream (9) ·
8588006139983 GymBeam dextrose (7). Full list with sources in baza_v7_multicountry_eans.csv.
CAUTION: several multi-market claims rest on a generic "worldwide shipping" page. That is not per-country
delivery proof; such market claims stay LEAD until a country-specific source exists.
A04 status: 0 CONFIRMED multi-country EANs until verification.
