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
