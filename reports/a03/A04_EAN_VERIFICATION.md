# A04 / F02 — EAN × market verification of BAZA GELATO v7 (2026-09-10)

WORKING evidence on a WORKING dataset (v7 = WORKING, NOT FINAL — D-7). Nothing here is customer-visible and nothing
was written to the app, Mapper, database, staging or production. Every number below is computed from the CSVs beside this file.

## What was checked
- 450 v7 coverage cells = 75 markets × 6 roles. 375 PR cells (MILK, CREAM, SMP, DEXTROSE, TARA × 75) need an exact EAN;
  SUCROSE is a global PI with no EAN (D-8) and is covered by sucrose_local_terms_75.csv instead.
- 838 unique v7 source URLs fetched with curl (DNS over HTTPS; egress country ES). Status + SHA-256 per URL in
  a04_fetch_log_v7.csv. HTTP: 200 634 · 403 160 · 000 14 · 404 11 · 429 3 · 307 3 · 503 3 · 400 3 · 406 2 · 302 2 · 410 1 · 405 1 · 202 1. Raw HTML is not committed.
- 46 URLs re-checked in the in-app browser (rendered DOM) where the raw HTML was blocked or carried no EAN:
  a04_browser_evidence_v7.json. 11 of them stayed INCONCLUSIVE (bot wall, empty or shell page) and count as LEAD.

## Evidence rule (applied mechanically)
- CONFIRMED = a DIRECT page (manufacturer or retailer) that serves THAT market carries the exact EAN as data — a JSON-LD
  gtin/sku, an itemprop, or an "EAN:" label. Not counted: the EAN inside a URL or a search-query echo; the EAN glued into
  a retailer code (e.g. OS3412290032215); aggregators and price-comparison sites; marketplaces.
- Page market: ccTLD → explicit locale path (xx-YY, YY/lang) → locale subdomain → one seller addressCountry → a currency
  used by exactly one of the 75 markets (never EUR/USD, never a Shopify-converted price, never the egress currency).
- Everything else with a source is LEAD; a cell with no EAN in v7 is BRAK. HYPOTHESIS: 0 cells (every EAN cell has a source).

## Result — 375 PR cells
| tier | cells | CONFIRMED | LEAD | BRAK |
|---|---:|---:|---:|---:|
| CORE ★★★★★ | 100 | 49 | 39 | 12 |
| SUPPORTED ★★★★ | 275 | 73 | 134 | 68 |
| ALL | 375 | 122 | 173 | 80 |

| role | CONFIRMED (CORE of 20) | LEAD | BRAK |
|---|---:|---:|---:|
| MILK | 40 (16) | 35 | 0 |
| CREAM | 32 (13) | 43 | 0 |
| SMP | 31 (11) | 35 | 9 |
| DEXTROSE | 19 (9) | 9 | 47 |
| TARA | 0 (0) | 51 | 24 |

How the CONFIRMED cells were reached: RAW_HTML/CCTLD 99 · RAW_HTML/CURRENCY 11 · BROWSER_DOM/CCTLD 8 · RAW_HTML/PATH_LOCALE 3 · BROWSER_DOM/CURRENCY 1.
LEAD breakdown: EAN_ON_GENERIC_TLD_PAGE 92 · MARKET_PAGE_WITHOUT_EAN 24 · EAN_ON_FOREIGN_MARKET_PAGE 21 · PAGE_WITHOUT_EAN 12 · SOURCE_NOT_READABLE 11 · EAN_ONLY_ECHOED_FROM_URL_OR_QUERY 5 · EAN_ON_AGGREGATOR 5 · EAN_ON_MARKETPLACE_MARKET_PAGE 3.

- Markets with at least one CONFIRMED PR role: 56/75. Markets with all five PR roles CONFIRMED: 0.
- Markets with no CONFIRMED PR role (19): BD, BH, CN, CY, GH, HK, ID, IL, JP, KW, MA, NG, PA, PH, SA, TN, TR, US, VN — CORE among them: US.
- TARA: 0 CONFIRMED in 75 markets · LEAD 51 (EAN_ON_GENERIC_TLD_PAGE 47, SOURCE_NOT_READABLE 2, EAN_ON_FOREIGN_MARKET_PAGE 1, PAGE_WITHOUT_EAN 1) · BRAK 24. No page serving a market carries a TARA EAN in this evidence; per D-10 the cells stay LEAD/BRAK and
  nothing is substituted.

Currency-attributed CONFIRMED cells (12), listed so the owner can accept or downgrade them: DZ-MILK www.taibaoline.com (DZD); EG-MILK www.carrefouregypt.com (EGP); IN-MILK www.billclap.com (INR); IN-SMP kiranamarket.com (INR); CO-CREAM www.megatiendas.co (COP); CO-SMP www.mercacentro.com (COP); KR-CREAM lottemartzetta.com (KRW); KR-SMP lottemartzetta.com (KRW); CR-CREAM www.megasuper.com (CRC); MX-MILK onixsuper.com (MXN); OM-MILK youshopom.com (OMR); PK-MILK zainabfamilymart.com (PKR).

## CORE gap list (cells not CONFIRMED)
| market | role | class | v7 status |
|---|---|---|---|
| AT | SMP | NO_EAN_IN_V7 | WYMAGA_GTIN |
| AT | DEXTROSE | EAN_ON_FOREIGN_MARKET_PAGE | KANDYDAT_PR |
| AT | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| AU | CREAM | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| AU | SMP | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| AU | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| BE | SMP | MARKET_PAGE_WITHOUT_EAN | WYMAGA_ETYKIETY |
| BE | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_GTIN |
| BE | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| CA | CREAM | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| CA | TARA | NO_EAN_IN_V7 | WYMAGA_ETYKIETY |
| CH | CREAM | SOURCE_NOT_READABLE | KANDYDAT_PR |
| CH | SMP | NO_EAN_IN_V7 | WYMAGA_GTIN |
| CH | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| DE | SMP | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| DE | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| DK | SMP | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| DK | TARA | NO_EAN_IN_V7 | WYMAGA_ETYKIETY |
| ES | CREAM | EAN_ONLY_ECHOED_FROM_URL_OR_QUERY | KANDYDAT_PR |
| ES | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| FI | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_ETYKIETY |
| FI | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| FR | MILK | SOURCE_NOT_READABLE | READY_PR |
| FR | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_GTIN |
| FR | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| GB | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_ETYKIETY |
| GB | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| IE | MILK | EAN_ON_AGGREGATOR | KANDYDAT_PR |
| IE | SMP | EAN_ON_FOREIGN_MARKET_PAGE | KANDYDAT_PR |
| IE | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_ETYKIETY |
| IE | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| IT | DEXTROSE | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| IT | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| NL | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_GTIN |
| NL | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| NO | MILK | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| NO | CREAM | SOURCE_NOT_READABLE | KANDYDAT_PR |
| NO | TARA | EAN_ON_FOREIGN_MARKET_PAGE | WYMAGA_ETYKIETY |
| NZ | CREAM | MARKET_PAGE_WITHOUT_EAN | KANDYDAT_PR |
| NZ | SMP | PAGE_WITHOUT_EAN | KANDYDAT_PR |
| NZ | DEXTROSE | EAN_ON_FOREIGN_MARKET_PAGE | KANDYDAT_PR |
| NZ | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| PL | DEXTROSE | NO_EAN_IN_V7 | WYMAGA_GTIN |
| PL | TARA | NO_EAN_IN_V7 | WYMAGA_GTIN |
| PT | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| SE | TARA | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| US | MILK | SOURCE_NOT_READABLE | KANDYDAT_PR |
| US | CREAM | PAGE_WITHOUT_EAN | KANDYDAT_PR |
| US | SMP | EAN_ON_GENERIC_TLD_PAGE | KANDYDAT_PR |
| US | DEXTROSE | EAN_ON_GENERIC_TLD_PAGE | WYMAGA_ETYKIETY |
| US | TARA | EAN_ON_GENERIC_TLD_PAGE | HOLD_US |

## A04 — the same EAN in more than one market
v7 lists 33 EANs in more than one market. CONFIRMED in ≥ 2 markets: **7** · one market only: 12 · none: 14.

| EAN | role | product (v7) | v7 markets | CONFIRMED markets |
|---|---|---|---:|---|
| 8588006139983 | DEXTROSE | Декстроза - GymBeam, bez dodatków smakowych | 7 | CZ(CCTLD/RAW_HTML); HR(CCTLD/RAW_HTML); HU(CCTLD/RAW_HTML); RO(CCTLD/RAW_HTML); SI(CCTLD/RAW_HTML); SK(CCTLD/RAW_HTML) |
| 5709286720064 | DEXTROSE | Urtegaarden Druesukker 500 g | 3 | DK(CCTLD/RAW_HTML); NO(CCTLD/RAW_HTML); SE(CCTLD/RAW_HTML) |
| 4744130012590 | DEXTROSE | ICONFIT Dextro, czysta dekstroza w proszku | 3 | EE(CCTLD/RAW_HTML); LT(CCTLD/RAW_HTML); LV(CCTLD/RAW_HTML) |
| 8718907237888 | CREAM | AH Slagroom houdbaar 30% 200 ml | 2 | BE(CCTLD/BROWSER_DOM); NL(CCTLD/BROWSER_DOM) |
| 5709310050303 | MILK | Arla Sødmælk 3,5% UHT 1 L | 2 | DK(CCTLD/RAW_HTML); SE(CCTLD/RAW_HTML) |
| 5900820000455 | CREAM | Łaciata Śmietanka UHT 30% 500 ml | 2 | GB(PATH_LOCALE/RAW_HTML); IE(CCTLD/RAW_HTML) |
| 8585002501837 | CREAM | Meggle Frișcă lichidă UHT 30% | 2 | HU(CCTLD/BROWSER_DOM); RO(CCTLD/RAW_HTML) |

One market only: 3412290032215 CREAM → KR(CURRENCY/RAW_HTML); 5701215046375 CREAM → KE(CCTLD/RAW_HTML); 9317127061786 DEXTROSE → AU(CCTLD/RAW_HTML); 4250573301738 DEXTROSE → DE(CCTLD/RAW_HTML); 6408430840625 SMP → FI(CCTLD/RAW_HTML); 5060113910714 SMP → GB(CCTLD/RAW_HTML); 3838800040578 MILK → SI(CCTLD/RAW_HTML); 3043939531112 SMP → MT(CCTLD/RAW_HTML); 9556958338807 SMP → MY(CCTLD/RAW_HTML); 4955447100416 MILK → TW(CCTLD/RAW_HTML); 3043931691418 SMP → QA(CCTLD/RAW_HTML); 4770265041259 MILK → LT(CCTLD/RAW_HTML).
Not confirmed anywhere: 8055728540170 TARA (28 v7 markets); 819543011967 TARA (14 v7 markets); 733739058324 SMP (13 v7 markets); 9300639999005 SMP (4 v7 markets); 711221973058 TARA (4 v7 markets); 3043931692415 SMP (3 v7 markets); 5700426230177 CREAM (3 v7 markets); 8050246530061 DEXTROSE (2 v7 markets); 6281007040235 MILK (2 v7 markets); 5711953072352 MILK (2 v7 markets); 3161911703385 CREAM (2 v7 markets); 5701215046832 MILK (2 v7 markets); 5901432003261 CREAM (2 v7 markets); 8410285127347 MILK (2 v7 markets).

Withdrawn during the run (would have been false confirmations): Valio SMP 6408430840625 in EE — the page was a search
result echoing the query; MŪ milk 4770265041259 in LV — the EAN appears only in the product URL. GymBeam dextrose
8588006139983 is CONFIRMED in 6 of its 7 v7 markets; BG stayed behind a bot wall. The two TH codes 2033200071103 (TARA) and
2055040011118 (DEXTROSE) are GS1 restricted-circulation numbers; their pages sit behind a bot wall; they stay LEAD and can
never be used as a cross-market identity.

## S6' — retailer-owned brands
21 PR cells carry a retailer-owned brand (reviewer token list — identification is HYPOTHESIS-grade).
Retailer-owned EANs used in more than one market: 8718907237888 (BE:CONFIRMED, NL:CONFIRMED); 8588006139983 (BG:LEAD, CZ:CONFIRMED, HR:CONFIRMED, HU:CONFIRMED, RO:CONFIRMED, SI:CONFIRMED, SK:CONFIRMED); 4744130012590 (EE:CONFIRMED, LT:CONFIRMED, LV:CONFIRMED).
Each shared one must carry its own per-market proof; a market without it stays LEAD.

## D08 — requirement × evidence
| v7 requirement | CONFIRMED | LEAD | BRAK |
|---|---:|---:|---:|
| VERIFY_CANDIDATE | 107 | 144 | 0 |
| LABEL_EVIDENCE_MISSING | 13 | 11 | 61 |
| GTIN_MISSING | 0 | 0 | 16 |
| LOCAL_PURCHASE_PATH_MISSING | 0 | 13 | 3 |
| CONDITIONAL_CANDIDATE | 1 | 2 | 0 |
| PI_ESTIMATE_ONLY | 1 | 1 | 0 |
| NONE_PER_V7 | 0 | 1 | 0 |
| HELD_IN_V7 | 0 | 1 | 0 |

CONFIRMED here means only that the EAN is sold in that market on the evidence date. Label composition, nutrition, pack
and price are not verified by this run, so a CONFIRMED cell can still carry a v7 label requirement.

## Sucrose (D-8)
SA10 (01_SEARCH_ALIASES, concept SC-ING-000169) gives an everyday sugar phrase for 44 markets and only the
technical name for 31: BD, BG, BR, CN, CY, CZ, DK, EE, EG, FI, GR, HR, HU, ID, IL, IS, JP, KR, LT, LV, NL, NO, PT, RO, SE, SI, SK, TH, TR, TW, VN.
v7 writes the Polish "Biały cukier krystaliczny — 100% cukier" in all 75 rows. 26 markets have more than one locale in the SA10 locale contract.

## What this does NOT prove
- Stock, price, pack size or label composition. A missing EAN on a page does not mean the product is not sold.
- The browser pane shows bot walls in Polish, i.e. it runs with a Polish locale; bot walls were never bypassed.
- v7 stays WORKING. On the final BAZA, cells are re-joined on (market, role, EAN) and verified evidence is carried over.

## Files
- a04_ean_verification_v7.csv — one row per v7 cell: class, best URL, source type, page market and how, method, context, hash, time
- a04_multicountry_status_v7.csv — the multi-market EANs and their per-market status
- a04_market_summary_v7.csv — 75 markets × 5 PR roles
- a04_fetch_log_v7.csv — every fetched URL: HTTP status, final URL, bytes, SHA-256, UTC time
- a04_browser_evidence_v7.json — rendered-DOM checks
- d08_missing_requirements_v7.csv — 375 PR cells with v7 requirement + A04 evidence class
- sucrose_local_terms_75.csv — sucrose term per market

## Superseded wording (owner update 2026-09-10 c)
TARA is no longer a mandatory product per market (D-13). Read every TARA statement above as the STABILIZER slot /
best safe local verified product. The TARA evidence in this file stays as recorded; the stabilizer search continues
in stabilizer_slot_75_v7.csv.
