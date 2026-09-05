# Global Base-Product / Country / Shop Architecture — Discovery Audit

STAGING SHA: 6197820e64b3b16646b3f6335b5599eabd9c0a77 (2026-09-05, PR #175)
Branch: claude/pl-country-product-set (fresh, off current staging)
Scope: discovery only (A01-A05, B01-B06, C01-C03). No Mapper change, no PL seeding, no PI added.

## OVERALL: 6 / 35 = 17.1%

## Master checklist

PHASE A
[~] A01 Complete global country/market ledger. DEP: -. LINKS: Country authority / Shop.
    EVIDENCE: no complete ledger exists. `catalog_market_countries` = 18 active markets (created 2026-08-26)
    is the closest authority; `shop_countries` = 17 (1 not in the 18). Country validation in
    productCountryPreference.ts is `/^[a-z]{2}$/i` - ANY two letters, not an ISO 3166-1 set.
    No ISO alpha-2 list exists anywhere in src/ or supabase/ (searched for ZW/AF/VU).
[x] A02 Separate MARKET COUNTRY vs COUNTRY OF ORIGIN. DEP: A01. LINKS: PR identity / provenance.
    EVIDENCE: product facts carry `countryOfOrigin` and `market`/`markets[]` as separate fields
    (resolver output for PR-ING-007173: countryOfOrigin ES, markets ["ES"]). Live counter-example
    captured and recorded this session: PL dextrose PR-ING-007169 market=PL, origin=BELGIUM.
[ ] A03 Map relevant retailers/manufacturers by market. DEP: A01.
[ ] A04 Detect exact EAN/product overlap across countries. DEP: A03.
[ ] A05 Evidence-based market/product clusters. DEP: A04.

PHASE B
[~] B01 Freeze global base-product family scope. DEP: A01. Draft produced below; needs Owner freeze.
[~] B02 Audit global real milk variants. DEP: A03,B01. PI side audited (8 variants); global real side pending A03.
[~] B03 Audit cream / milk powder / cream powder. DEP: A03,B01. PI side audited.
[~] B04 Audit sugar / dextrose / fructose / sucrose. DEP: A03,B01. PI side audited (43 sweeteners).
[~] B05 Audit inulin / stabilizers / gums. DEP: A03,B01. PI side audited (50 stabilizers, 13 fiber).
[~] B06 Audit plant bases and protein ingredients. DEP: A03,B01. PI side audited.

PHASE C
[~] C01 Compare global technological variants vs existing PI. DEP: B02-B06. PI side complete; global side pending.
[~] C02 Missing neutral PI candidate list. DEP: C01. Preliminary list of 6 below.
[ ] C03 Prove each proposed new PI is technologically meaningful. DEP: C02.
[ ] C04 OWNER REVIEW of missing PI candidates. DEP: C02,C03. OWNER GATE.
[ ] C05 Controlled addition of approved neutral PI types. DEP: C04.

PHASE D
[x] D01 One exact PR identity per real EAN/SKU. DEP: A04.
    EVIDENCE: 11 distinct real EANs across active products, each appearing exactly once;
    0 duplicate real-EAN rows (2107 rows carry an empty-string EAN and are not real EANs).
    Enforced by exactProductByEan lookup + preview_product_duplicates_v1 before ingest.
[~] D02 PR stores exact commercial identity + origin + markets. DEP: D01,A02. 4 of 7 commercial PRs carry both.
[~] D03 Gather manufacturer/label/trusted-retailer source facts. DEP: D01. Done for 3 canonical milks + 3 PL products.
[x] D04 Store per-field VERIFIED / DERIVED / ESTIMATED / UNKNOWN truth. DEP: D03.
    EVIDENCE: live `productIntelligence.fieldTruth` per field with {basis, state}: label fields
    user_confirmed/VERIFIED; water/lactose/PAC/POD mapper_similar_profile/ESTIMATED;
    total_solids derived/ESTIMATED. Read from staging for PR-ING-007173.
[x] D05 Normalize technical facts while preserving raw basis. DEP: D03.
    EVIDENCE: PR-ING-007172/3/4 keep nutrition.basis = per_100ml while technicalComposition
    carries the numerically identical per-100 g working values. Frozen 1 ml = 1 g rule applied in
    six TS/edge seams and three SQL seams (20260904102817_canonical_per_100ml_runtime_normalization).
[~] D06 Bind PR to correct neutral PI. DEP: C05,D04,D05. 3 milks bound to PI-ING-000236; 3 PL products unbound.
[~] D07 Verify Engine readiness of every required base PR. DEP: D06. 3 of 3 canonical milks engine-usable.
[ ] D08 Record exact missing requirements for every NOT READY PR. DEP: D07.

PHASE E
[x] E01 Country defaults use existing Product Country authority. DEP: D07.
    EVIDENCE: resolve_country_product_slots_v1 returns COUNTRY_PRIMARY_DEFAULT for PL (Laciate),
    ES (Hacendado) and FR (Alsace Lait) against slot PI-ING-000236. 3 active assignments.
[x] E02 USER_PREFERRED exact PR precedence preserved. DEP: E01.
    EVIDENCE: user_preferred_product_slots holds 1 pointer; set/get/clear RPCs exist;
    CP-48 scenario C served proof recorded USER_PREFERRED winning over the ES primary.
[~] E03 Normal picker exposes neutral technological PI names. DEP: C05,E01. Needs own served verification.
[~] E04 Exact brand/PR available through details/exact search. DEP: E03. CP-48 F/G passed; not re-verified here.
[~] E05 Barcode scan resolves exact PR -> PI -> country/user flow. DEP: D06,E02. Scan flow merged (#177).

PHASE F
[ ] F01 Shop references same approved PR products. DEP: D07.
[~] F02 Attach supplier / URL / market availability. DEP: F01,A03. shop_country_components has URLs, not PR-linked.
[~] F03 Complete 0 EUR Local Starter Pack PDF per country/cluster. DEP: F02.
[ ] F04 Cluster countries with identical production product sets. DEP: A05,F03.
[ ] F05 Terminal-valid GELATO country base. DEP: F04,D07.
[ ] F06 Terminal-valid SORBET / VEGAN / PROTEIN country bases. DEP: F04,D07.

## G01 — MAPPER COUNT RECONCILIATION (2088 vs 2089) — RESOLVED

WHAT WAS COUNTED: public.mapper_basement. Internally consistent at 2089 on every filter:
TOTAL 2089 / dataset_version='v1.0' 2089 / v1.0 AND is_active 2089 / inactive 0 /
distinct ingredient_id 2089 / products WHERE product_kind='mapper_reference' 2089 /
mapper_process_metadata 2089. (mapper_basement_search = 2076 = the approved_for_base subset, unrelated.)

ROW HISTORY (created_at):
  2026-07-16  2083 rows  PI-ING-000001 .. PI-ING-002108   original frozen load
  2026-08-09  +5   rows  PI-ING-002109 .. PI-ING-002113   -> running total 2088
  2026-08-28  +1   row   PI-ING-002114                    -> running total 2089

THE EXACT DIFFERENCE RECORD: PI-ING-002114
  'GELLATTI STABILIZER . Gellatti Stabilizer Blend . Dry'
  internal: gellatti_stabilizer | category stabilizer / stabilizer_blend | approved_for_base true
  verification_status 'Verified / PI Calculated' | verification_source OWNER_FORMULATION
  created_at 2026-08-28 20:07:50.70873+00 | last_reviewed_at 2026-08-28

SOURCE: supabase/migrations/20260828170000_mapper_basement_2089_gellatti_stabilizer.sql
  Header states verbatim: "Owner-authorized canonical Mapper expansion: exactly one new row."
  Companion migrations: 20260828170100_mapper_process_metadata_2089.sql,
  20260828170200_gellatti_stabilizer_product_authority.sql. Present on origin/main.

CLASSIFICATION: NOT drift, NOT unauthorized. A legitimate owner-authorized expansion, self-declared
in the migration filename ("2089") and sourced OWNER_FORMULATION. 2088 was the true count between
2026-08-09 and 2026-08-28. Gellatti Stabilizer is itself named in the B01 frozen scope.

THE 5 ROWS OF 2026-08-09 (for completeness): PI-ING-002109..002113, Spanish retail soy / high-protein
items (Carrefour, EcoCesta, Alpro, Vivesoy), verification_source "Official Carrefour product page".
These are brand-specific commercial rows living in the PI layer.

NEUTRALITY MEASUREMENT (corrected): neutrality is marked by brand='Standard' (original load) OR an
empty brand (later rows) - NOT by an empty brand alone. Corrected totals:
  2089 rows -> 258 neutral (12.4%) / 1831 brand-specific.
Base-scope families: dairy 155/31 neutral, sweetener 43/31, stabilizer 50/8, beverage 193/5,
coconut 26/8, fiber 13/2, fat 8/7, egg_product 7/6, protein 6/6, starch 4/4, egg 2/2, emulsifier 1/0.

## ALSACE LAIT — IMPACT OF THE TEMPORARY WRONG BINDING (no mutation made)

WRONG / TEMPORARY SLOT BINDING recorded. PR-ING-007174 'Lait liquide frais entier Alsace Lait',
EAN 3262970109108, label fat 3.6%, bound to PI-ING-000236 = MILK 3.5%.

SELECTABLE TODAY? YES. resolve_country_product_slots_v1(['PI-ING-000236'],'FR','GELATO') returns it as
COUNTRY_PRIMARY_DEFAULT with usable_in_base=true and engineUsable=true.

IMPACT IS TAXONOMIC, NOT NUMERIC. The Engine reads the PRODUCT-OWNED profile, so
technicalComposition.fat = 3.6 - the product's own declared value, not the slot's 3.5. No recipe is
mis-calculated. The defect is that a French user choosing the neutral concept "MILK 3.5%" is served a
3.6% product. Migration required once neutral MILK 3.6% is approved under C04/C05.

CORRECTION TO THE PREVIOUS AUDIT: Hacendado EAN 8402001047251 must NOT be cited as MILK 3.6% evidence.
The current exact PR declares fat 3.5 (verified in resolver output) and is correctly bound to
PI-ING-000236. PI-ING-000546 'LECHE ENTERA 1L . Hacendado Milk' at 3.6% is a legacy brand-named Mapper
row, not proof about the current PR. Alsace Lait is the only real 3.6% PR evidence.

## A01 — GLOBAL MARKET LEDGER (DONE)

ARTIFACT: src/data/markets/isoMarkets.ts + isoMarkets.test.ts (11 tests pass).
249 officially assigned ISO 3166-1 alpha-2 codes. Two independent sources agree:
the published officially-assigned set (fetched 2026-09-05) and this runtime's ICU region data
(every one of the 249 is recognised). ICU alone yields 280 and is a SUPERSET - exceptionally
reserved (AC/EU/UK/UN/EZ/IC/TA), user-assigned (XK) and CLDR aggregates (QO) are excluded and pinned
by test.

DESIGN - vocabulary, not a business authority:
  ISO ledger        answers "is this a real market code?"          (shared vocabulary)
  catalog_market_countries  answers "does the product catalogue serve this market?"
  shop_countries            answers "can the customer buy/ship here?"
Both business authorities stay separate and unchanged; each is a SUBSET of the vocabulary.
marketSupport(code, authority) returns SUPPORTED / UNSUPPORTED / UNKNOWN, so "a real market we do
not serve yet" is distinguishable from "not a market at all". No third business authority created.

RECONCILIATION against staging 6197820e:
  catalog_market_countries 18 - all valid ISO
  shop_countries           17 - all valid ISO
  country_product_slot_assignments 3 (ES,FR,PL) - all valid, all present in the catalogue authority
  country_local_products   2 (PL,US) - all valid
  in SHOP not in CATALOG: CA        in CATALOG not in SHOP: GB, PH
  union = 19 markets; 230 of the 249 ISO markets are in neither list
No invalid country code exists in staging today. The exposure was the `/^[a-z]{2}$/i` check, which
would have accepted "XX"/"QQ"/"ZZ" - now refused by marketCode() and pinned by test.

## B01 — FROZEN SCOPE VERIFIED AGAINST ACTUAL USAGE (DONE)

The Starter Pack is not a guess: shop_products holds one bundle + 7 real component SKUs, and
src/features/constraint-studio/starterPackRescuePalette.ts pins the SAME 7 as PI ids.

| SKU | Component | PI | brand | fat% | neutral? |
|---|---|---|---|---|---|
| GEL-DEX-500 | Dekstroza | PI-ING-000494 DEXTROSE | Standard | 0 | YES |
| GEL-FRU-500 | Fruktoza | PI-ING-000496 FRUCTOSE | Standard | 0 | YES |
| GEL-INU-500 | Inulina | PI-ING-000456 INULIN | Standard | 0 | YES |
| GEL-YOL-500 | Suszone zoltko | PI-ING-001645 EGGS CHICKEN YOLK DRIED | (empty) | 56.5 | YES |
| GEL-SMP-500 | Odtluszczone mleko w proszku | PI-ING-000270 SKIMMED MILK | Standard | 0.8 | YES |
| GEL-CRP-500 | Smietanka w proszku 42% | PI-ING-000260 CREAM . Mlekovita Cream | **Mlekovita** | 42 | **NO** |
| GEL-STB-500 | Gellatti Stabilizer | PI-ING-002114 | Gellatti | 0.54 | own product, acceptable |

6 of 7 resolve to a neutral technological PI. ONE does not.

## C02/C03 — CANDIDATE LIST CORRECTED BY EVIDENCE

WITHDRAWN - INULIN. It already exists as a neutral PI, twice: PI-ING-000456 'INULIN . Specialty'
and PI-ING-000455 'INULIN . Specialty . BIO', brand 'Standard', approved_for_base. My earlier audit
missed them because they sit in category `specialty`, not `fiber`. They are the ids the Starter Pack
palette already uses.

RECHARACTERISED - CREAM POWDER 42%. Not "missing"; it exists as PI-ING-000260 at exactly 42% fat,
Verified, approved_for_base - but BRAND-NAMED 'Mlekovita'. So this is a NEUTRALISATION candidate, not
a creation candidate. It matters because the Starter Pack - the set every country must reproduce -
depends on a foreign brand row standing in for a generic technological type, and under the Owner UX
rule the picker would show "CREAM . Mlekovita Cream" where it should show a neutral 42% cream powder.
WHOLE MILK powder (PI-ING-000296) is not a substitute: 26% fat vs 42%, a 16-point gap.

STILL OPEN, awaiting C03: MILK 3.6% (only real PR evidence is Alsace Lait), CARRAGEENAN, SOY DRINK,
EMULSIFIER.
