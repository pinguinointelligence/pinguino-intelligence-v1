# PDF 0€ — DATA ARCHITECTURE (design only; no final PDF before the final BAZA is accepted)

Status: PREPARED 2026-09-10 on BAZA GELATO v7 = WORKING, NOT FINAL (owner D-7). Reports-only; nothing written to the
app, Mapper or database.

## Purpose
One shopping list per market for a base recipe (GELATO now; SORBET / VEGAN / PROTEIN later through the same shape,
without inventing their formulas or PI selections — D-9). A customer in market X sees, for every base role, an item
they can actually buy in X, or an explicit BRAK.

## Authorities (never duplicated)
- PI identity and generic facts: FINAL_FROZEN Mapper 2541, by stable PI-ING ID (D-1, D-2).
- Exact commercial product: PR-ING (proposal key until accepted; final PR id AUTO PO AKCEPTACJI — never invented).
- Country selection: the existing Product Country authority (country + PI → exact PR), not a PDF-specific list.
- Shop: references the SAME PR identities; no Shop-only technical duplicates (F01).

## Row model — one row per (market × base × role)
| field | meaning |
|---|---|
| market_iso2, market_priority, routing_region | one of the 75 markets; ★★★★★ CORE first, then ★★★★ |
| locale | consumer language(s) of the market |
| base_id, role, grams_per_1000g | e.g. GELATO / MILK / 672 |
| pi_ing, pi_name_final | PI by stable ID; name refreshed from 2541 |
| product_mode | EXACT_PR, or GLOBAL_PI_GENERIC (sucrose — D-8) |
| consumer_term_local | the generic local term, used when product_mode = GLOBAL_PI_GENERIC |
| pr_proposal_key, pr_final_id | proposal key from BAZA; final id empty until accepted |
| brand, product_name, pack, manufacturer | exact commercial identity |
| ean_gtin | TEXT with leading zeros; never a number |
| ean_integrity | OK / FAIL / OK_AFTER_ZERO_PAD / RCN_RANGE / ABSENT |
| origin_country, markets_evidenced[] | origin ≠ market (A02) |
| url_product, url_purchase | direct usable pages |
| source_type | MANUFACTURER / OFFICIAL_SHOP / RETAILER / MARKETPLACE / AGGREGATOR |
| evidence_date | date the page was checked |
| evidence_class | CONFIRMED / LEAD / HYPOTHESIS / BRAK |
| deviation_vs_pi | e.g. fat 35.4 vs 30 — exact PR facts win; Engine recalculates |
| process_message | e.g. tara heating instruction |

## Rules
1. Only CONFIRMED rows are customer-visible. LEAD and HYPOTHESIS are never final customer authority (D-10).
2. BRAK is written explicitly. No silent substitution of a similar product to fill a slot.
3. SUCROSE: GLOBAL_PI_GENERIC with the local consumer term; no brand, no EAN (D-8). An optional convenience link
   never changes canonical identity.
4. An EAN in the GS1 restricted-circulation range is never used as cross-market identity.
5. Region never activates a PR; a PR is shared across markets only with per-market evidence of the same product,
   pack, EAN and composition.
6. New SKU without a safe existing PI → REVIEW_REQUIRED; SHOP never creates a PI (D-3).

## Relation to the existing Shop "Local Starter Pack"
The existing 0€ Local Starter Pack (shop_country_components; 7 Starter Pack components) is a separate, live
artifact. The base-driven PDF reuses the same PR identities where the products coincide (e.g. skimmed milk
powder, dextrose); it does not create parallel product records.

## v7 → final reconciliation (deterministic, prepared now)
Primary join key (market_iso2, role, EAN); fallback (market_iso2, role, proposal key). Output: unchanged / changed
/ added / removed rows, with every previously verified evidence record carried forward. Research is not restarted.

## Evidence fields (added 2026-09-10 after the A04 run)
- evidence_method — RAW_HTML (curl, SHA-256 of the fetched page kept in a04_fetch_log_v7.csv) or BROWSER_DOM (rendered page in the
  in-app browser; no stored page — the matched context string and UTC time are kept instead). Re-verify both before a final PDF.
- market_by — how the page's market was decided: CCTLD, PATH_LOCALE, SUBDOMAIN_LOCALE, ADDRESS_COUNTRY or CURRENCY.
- source_type — DIRECT (manufacturer or retailer), MARKETPLACE or AGGREGATOR. Only DIRECT can confirm.
- verification_class — EAN_ON_MARKET_PAGE (the only class that yields CONFIRMED), EAN_ON_GENERIC_TLD_PAGE, EAN_ON_FOREIGN_MARKET_PAGE,
  EAN_ON_MARKETPLACE_MARKET_PAGE, EAN_ON_AGGREGATOR, EAN_ONLY_ECHOED_FROM_URL_OR_QUERY, EAN_EMBEDDED_IN_RETAILER_CODE,
  MARKET_PAGE_WITHOUT_EAN, SHIPPING_POLICY_PAGE_ONLY, PAGE_WITHOUT_EAN, SOURCE_NOT_READABLE, NO_SOURCE_URL, NO_EAN_IN_V7.
- Mapping to D-10 classes: EAN_ON_MARKET_PAGE → CONFIRMED; any other class with a source → LEAD; NO_SOURCE_URL → HYPOTHESIS;
  NO_EAN_IN_V7 → BRAK. Working values for v7: reports/a03/a04_ean_verification_v7.csv.

## STABILIZER slot (owner update 2026-09-10 c — supersedes "role = TARA")
The stabilizer position is a functional slot, not one ingredient. One row per market:
functional_slot=STABILIZER · stabilizer_type (TARA | GUAR | LBG | STABILIZER_BLEND | OTHER_EXISTING_APPROVED_STABILIZER) ·
selected_pi_ing (an EXISTING FINAL 2541 PI — never a new one) · selected_pr_ing (AUTO PO AKCEPTACJI until the final BAZA) ·
selected_product_name · brand · pack · ean_gtin · market_iso2 · url_product / url_purchase · availability_evidence
(verification_class, page_market, market_by, evidence_method, evidence_utc) · technical_doc_url · evidence_class_slot ·
engine_readiness · processing_readiness · final_use_status.
- evidence_class_slot ∈ CONFIRMED_LOCAL_TARA · CONFIRMED_LOCAL_ALTERNATIVE · LOCAL_ALTERNATIVE_PENDING_TECHNICAL_READINESS ·
  VERIFIED_CROSS_BORDER_FALLBACK · LEAD · BRAK. A proven local alternative is LOCAL_ALTERNATIVE_PENDING_TECHNICAL_READINESS
  until Engine/Processing clear it; only then CONFIRMED_LOCAL_ALTERNATIVE.
- final_use_status for an alternative = CANDIDATE_PENDING_TECHNICAL_READINESS until cleared; never FINAL BASE READY.
- SHOP stores no dosage. Grams in the customer PDF come only from the accepted country-base calculation, which must have
  been computed with the same stabilizer_type and PI as the product the PDF names (D-18).
- Customer-visible rule: the PDF shows the selected product; a local safe product outranks cross-border TARA.

## Selection authority and evidence labels (owner scope correction 2026-09-10 d — D-22..D-27)
- selection_authority — who decided the product in a row. The Owner's complete Excel is the only authority for
  country-base products (D-22). Until it arrives, rows carry the working-Excel (v7/v9) product, marked
  "WORKING EXCEL (incomplete) — awaiting Owner complete Excel". SHOP research never fills a row (D-23, D-24).
- evidence_label — for research that is not an Owner selection: VERIFIED_MARKET_EVIDENCE (exact EAN as data on a
  manufacturer/retailer page serving that market) · VERIFIED_PRODUCT_EVIDENCE (exact EAN as data on a manufacturer/
  retailer page; market not proven) · RESEARCH_LEAD. Stored in research_evidence_catalogue.csv with
  selection_status = NOT_SELECTED_AWAITING_OWNER_EXCEL.
- identifier_type — every EAN/SKU is typed before it can serve as a product identity (tooling/identifiers.py):
  GTIN-8 / GTIN-12 (UPC-A) / GTIN-13 / GTIN-14 with a valid checksum; RCN_STORE_INTERNAL (GS1 restricted circulation —
  store-internal, never a cross-market identity); ISBN / ISSN / COUPON (not food products); CHECKSUM_FAIL; NONE.
- Owner-Excel reconciliation (D-26) — tooling/reconcile_owner_excel.py gives each row s1..s9 results and a verdict; an
  unverifiable selection is REPORT_BACK_TO_OWNER, never replaced. The STABILIZER fallback hierarchy (D-14) is used only
  after an Owner-selected stabilizer fails verification.
- final_grams — only after Engine/Solver reaches the required 10/10 on the exact country products and the grams are
  frozen into a versioned country base (D-27). Working grams are the canonical base, shown for reference only.

## CONFIRMED_LOCAL two-fact model, market binding, locale routing (owner decisions 2026-09-10 e — D-29..D-33)
- CONFIRMED_LOCAL = (A) exact product identity AND (B) market binding, kept as separate fields:
  identifier_confirmed · exact_product_identity_confirmed (+ identity_basis: GTIN_ON_LOCAL_PAGE | GTIN_ON_SOURCE +
  ATTRIBUTE_MATCH | NOT_PROVEN) · market_binding_confirmed (+ market_binding_signal) · local_availability_confirmed = A ∧ B.
- Identity path 2 (tooling/identity_match.py): the exact GTIN on an authoritative manufacturer/retailer page plus an
  unambiguous match of brand, name, variant, pack and formulation to the local listing. A listing that offers several pack
  sizes, or carries a different GTIN, is not a match. Name similarity alone never confirms.
- Binding signals: country domain, country-specific path, locale subdomain, local legal entity/store (seller address),
  explicit country selector or delivery to the country, owner-approved host declaration. Currency is a supporting signal only
  and never binds (D-31). A generic .com binds to the US only with an explicit US signal (D-30).
- Sucrose rows carry the approved consumer term per locale (sucrose_consumer_terms_approved.csv); JP = グラニュー糖 (D-32).
- Locale: rows are keyed MARKET + LOCALE. Routing = user/account/session locale when supported → explicit market default
  locale → alternate variants preserved; a multilingual market may have several static PDF variants (D-32).
- Engine acceptance for any frozen base = the production Solver/Constraint Studio 10/10 state (D-33); see
  validation/country_validation_manifest.schema.json.
