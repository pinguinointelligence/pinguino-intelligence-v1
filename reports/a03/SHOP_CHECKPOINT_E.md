# SHOP checkpoint (e) — owner decisions D-28…D-35 applied; country-product work paused (2026-09-10)

Every number below is computed from the CSVs in this folder. No new product search was run for this checkpoint. Its only
page checks re-used cached pages, apart from the identity checks on the two SaporePuro rows (IT, HK), which re-read those
pages directly.

## Rules now in force
- CONFIRMED_LOCAL = exact product identity (the GTIN on the local page, or the GTIN on an authoritative page plus an
  unambiguous brand/name/variant/pack match) AND market binding (country domain/path, local entity or store, explicit
  delivery, selector …). Four separate fields are kept on every evidence row.
- Currency never binds a market (D-31). A generic .com binds to the US only with an explicit US signal (D-30). National
  product registers prove identity but not availability.
- Engine 10/10 = the production Solver/Constraint Studio state with every required band/gate of the profile in range (D-33).

## Effect on the working evidence
- Currency-only confirmations downgraded to LEAD: 12 — DZ-MILK, EG-MILK, IN-MILK, IN-SMP, CO-CREAM, CO-SMP, KR-CREAM, KR-SMP, CR-CREAM, MX-MILK, OM-MILK, PK-MILK. The original A04 class is kept in its own column.
- Working-Excel products with CONFIRMED_LOCAL evidence: 111/375 (CORE 50/100) — MILK 34, CREAM 29, SMP 29, DEXTROSE 19, STABILIZER 0.
- Research identified through a national product register: 2 (NO-CREAM, NO-MILK). Identity is confirmed; the register does not prove availability, so these are held pending your decision.
- Multi-market EANs (working Excel): CONFIRMED_MULTI_COUNTRY 7 · ONE_MARKET_CONFIRMED 11 · NOT_CONFIRMED 15. The 7 confirmed ones are all bound by country domains.
- Research evidence (not selections): RESEARCH_LEAD 54 · VERIFIED_PRODUCT_EVIDENCE 21 · VERIFIED_MARKET_EVIDENCE 43.

## v9 "TARA_LOCAL_CONFIRMED" — split into four fields (D-34; v9 evidence copied verbatim, nothing replaced)
| result | markets |
|---|---|
| CONFIRMED_LOCAL | IT, HK |
| LISTING_AND_BINDING_BUT_IDENTITY_NOT_PROVEN | CA, PL, AR, CL, CZ, GR, LT, MY, SG |
| IDENTITY_CONFIRMED_BINDING_NOT_PROVEN | US |
| NOT_PROVEN | BR, TH, TR |

- IT and HK: GTIN 8055728540170 is the maker's 50 g variant. IT binds by "For deliveries within Italy …" on the seller's
  own site; HK binds by the listing's Hong Kong local-delivery sentence (香港本地消費滿1000港元免運費).
- The listing pages name tara, but no GTIN ties them to one exact product. CZ (Valknut) and GR (NoCarb) are the shops'
  own brands, so a GTIN may not exist. LT lists 200/400/600 g on one page.
- US: the GTIN is on the seller page, but there is no US binding signal (D-30). BR, TH and TR: the page could not be read,
  and TH's code is store-internal.
File: v9_tara_status_split.csv.

## Sucrose consumer words (D-32)
Approved: 28 markets (29 locale rows). JP = グラニュー糖 by owner decision; 上白糖 is kept as evidence only.
BD, EG, NO: the term is owner-approved, although its page is tied to the market by currency only. File: sucrose_consumer_terms_approved.csv.
Locale: 26 multilingual markets keep every locale variant. Routing is MARKET + LOCALE; no market default is forced.

## Prepared for the Owner Excel and Engine 10/10 (no harness, no app code)
- tooling/: verifier with the four fields, identity_match.py (new), reconciler, identifier typing, quote checker, README.
- validation/: country_validation_manifest.schema.json, country_validation_manifest_template.csv (75), TEST_CASE_STRUCTURE.md.
- VERIFICATION_CHECKLIST_75.csv, market_locale_structure_75.csv, PDF0_DATA_ARCHITECTURE.md, ENGINE_10_10_VALIDATION_PIPELINE.md.

## Paused
Country-product work is paused until the Owner's complete Excel arrives (D-35); it will not be requested again. On arrival, the
reconciler checks it in 9 steps and reports every issue — nothing is substituted.
