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

## C03 UNDER THE CORRECTED TAXONOMY RULE (composition -> PR, product type -> PI)

DECISION RULE APPLIED: a candidate becomes a PI only if it is a different TECHNOLOGICAL PRODUCT TYPE.
The same type with a different measurable composition is carried by the exact PR.

| Candidate | Verdict | Evidence |
|---|---|---|
| MILK 3.6% | WITHDRAWN - percentage-only | Engine already reads the PR's own composition: the FR resolver returns engine fat 3.6 for Alsace Lait even while bound to the 3.5% slot. The percentage never needed a PI. |
| CREAM POWDER 42% | WITHDRAWN - percentage-only | same rule |
| INULIN | WITHDRAWN - already exists | PI-ING-000456 / PI-ING-000455 (BIO), neutral, approved_for_base, already used by the Starter Pack palette AND the vegan toolbox |
| CARRAGEENAN | WITHDRAWN for now - no demonstrated need | zero carrageenan rows exist in Mapper, but it is also absent from the Starter Pack palette, the vegan toolbox and every profile authority (grep: no reference). Coherence gap only - every other single gum (guar, LBG, xanthan, tara, cassia, pectin, agar) is neutral and present. |
| EMULSIFIER | WITHDRAWN - not a technological type | ~25 emulsifier rows exist, ALL branded commercial BLENDS (Cremodan, Extrulce, Gelmix, Neutro*, Softin, Fabbrisoft). No standalone emulsifier is referenced by any profile authority. A generic "EMULSIFIER" PI would be a composition carrier, not a type; the honest unit would be a specific single ingredient (E471 etc.) and nothing currently requires one. |
| SOY DRINK | **REMAINS THE ONLY GENUINE CANDIDATE** | src/data/ingredients/verifiedVeganToolbox.ts requires soy through FOUR brand-named ids (PI-ING-002109 Carrefour, 002110 EcoCesta, 002111 Alpro, 002112 Vivesoy) while its direct peers PI-ING-001565 OAT DRINK, 001566 RICE DRINK, 001587 ALMOND DRINK are neutral. Soy is a distinct botanical/technological class, not a composition variant of oat or almond. |

## FAMILY-LEVEL CONCEPTS THE CORRECTED RULE EXPOSES

The right question is not "is MILK 3.6% missing" but "does a neutral MILK concept exist at all".

MILK - NO neutral family concept. Only percentage variants, all brand 'Standard':
  PI-ING-000234 MILK 1.5% (fat 1.6 - the NAME AND THE DATA ALREADY DISAGREE)
  PI-ING-000200 MILK 2%   (fresh_milk)
  PI-ING-000235 MILK 3.2% (milk, protein 3.0)
  PI-ING-000201 MILK 3.2% (fresh_milk, protein 3.2)   <- the SAME percentage concept twice
  PI-ING-000236 MILK 3.5% (milk)
  plus brand legacy: PI-ING-000546/547/548 Hacendado entera/semi/desnatada

CREAM - one neutral row, itself percentage-named: PI-ING-001387 CREAM 33%.
  Everything else is brand legacy (Mlekovita 30% / 42%, Suprima PL 33%, Piatnica 18%) or a flavour
  paste that merely has "CREAM" in its name (Stella, Irca, Comprital) and is not dairy cream.

CREAM POWDER - no neutral row. Only PI-ING-000260 'CREAM . Mlekovita Cream' 42%.

MILK POWDER - ALREADY CORRECT, and it is the precedent to copy:
  PI-ING-000270 SKIMMED MILK and PI-ING-000296 WHOLE MILK carry NO percentage in their identity and
  are separated by technological class (skimmed vs whole), with fat 0.8 vs 26 living in the data.
  This is exactly the Owner model, already implemented, in the same table.

RECOMMENDATION SHAPE (for C04, not implemented): follow the milk-powder precedent. Distinguish MILK by
technological class where a class genuinely exists (skimmed / semi-skimmed / whole), never by
1.5 / 2 / 3.2 / 3.5 / 3.6 - those are PR composition. Same for CREAM and CREAM POWDER.

## ALSACE LAIT - FUTURE MIGRATION DIRECTION (documented only, nothing mutated)

Under the corrected model the long-term correction is NOT a new MILK 3.6% type. It is:
  Alsace Lait exact PR -> neutral MILK (or WHOLE MILK) concept -> Engine uses the exact 3.6% composition.
The binding stays untouched until C04/C05.

## LEGACY / PROLIFERATION FINDINGS (frozen, not to be migrated now)

- Duplicated percentage concept: MILK 3.2% exists twice (PI-ING-000235 milk, PI-ING-000201 fresh_milk),
  differing only in protein 3.0 vs 3.2 - a composition difference that under the corrected rule should
  never have produced two identities.
- Name/data drift: PI-ING-000234 is called MILK 1.5% and carries fat 1.6.
- CREAM 33% exists as both a neutral row (001387) and a brand row (001388 Suprima).
- The Vegan authority is COUPLED to four frozen brand rows (002109-002112). Leaving them frozen is
  correct per Owner decision, but the coupling means the vegan soy path currently depends on Spanish
  retail brands rather than a neutral type.

## MILK POWDER DECISION TEST — ANSWER: NO (composition, not class)

QUESTION: does SKIMMED vs WHOLE change any Engine/production authority in a way that cannot be
represented by PI = MILK POWDER + exact PR composition?

EVIDENCE 1 - no code branches on the two identities or on their subcategories.
  grep for PI-ING-000270 / PI-ING-000296 across src: matches only in engine __fixtures__ and one
  display string. No authority, gate, router or classifier reads them.

EVIDENCE 2 - THE ENGINE ALREADY HAS ITS OWN NEUTRAL VOCABULARY, and it does not make this distinction.
  src/spine/productProfiles.ts defines `CorrectionFamily`, the profile-level ingredient vocabulary:
    milk | cream | skimmed_milk_powder | sucrose | dextrose | inulin_fiber | stabilizer | water |
    fruit | hero_flavor_ingredient | oat_drink | soy_drink | almond_drink | rice_drink |
    coconut_milk_cream | plant_fat | plant_protein | whey_protein_concentrate |
    milk_protein_concentrate | high_protein_dairy | dark_chocolate | milk_chocolate | cocoa_powder |
    cocoa_mass | cocoa_butter | chocolate_paste
  There is EXACTLY ONE powder family and NO `whole_milk_powder`. The authority never distinguished
  skimmed from whole; it simply only ever modelled one powder lever.

EVIDENCE 3 - every gate that a powder moves is composition-driven: fat, total_solids, npac, water,
  aerating_protein. The family name is used for PERMISSION and LEVER ROUTING
  (`allowedCorrectionFamilies` intersected with `leverFamilies`), never for physics.

CONCLUSION: the future neutral concept is MILK POWDER. `skimmed_milk_powder` is itself a legacy
percentage-flavoured label, not a technological class.

ONE REAL CONSEQUENCE TO CARRY INTO C04/C05 (routing, not taxonomy):
  optimizationFlowRouter uses `skimmed_milk_powder` as the lever for increase_aerating_protein,
  increase_solids, decrease_water and decrease_npac. A single MILK POWDER family would let that lever
  pick a 26%-fat whole powder and push the HARD fat gate. The fix belongs in lever selection - choose
  the candidate by composition (low fat, high protein) instead of by the family label - NOT in keeping
  two PI types. Same-shaped risk applies to CREAM POWDER if it ever becomes a lever.

## THE SAME TEST APPLIED TO MILK, CREAM, CREAM POWDER

MILK   - the engine family is already `milk`, with no percentage. Answer: NO class distinction.
         The Mapper's MILK 1.5 / 2 / 3.2 / 3.2 / 3.5 rows are the anomaly, not the model.
CREAM  - the engine family is already `cream`, with no percentage. Answer: NO class distinction.
CREAM POWDER - there is NO `cream_powder` family in the engine vocabulary at all, yet the Starter Pack
         sells "Smietanka w proszku 42%" (GEL-CRP-500) and the rescue palette consumes PI-ING-000260.
         So cream powder is in real production use with no neutral family and no engine family. This is
         a genuine gap at BOTH layers, and the strongest remaining family-level candidate after SOY.
SOY DRINK - `soy_drink` is ALREADY a first-class CorrectionFamily alongside oat/almond/rice. Independent
         confirmation that soy is a technological type, and that only the PI layer is missing it.

## WHAT THIS MEANS ARCHITECTURALLY

The neutral technological vocabulary the Owner is asking for ALREADY EXISTS one layer up, in the engine
profile authority (`CorrectionFamily`). The proliferation is confined to the Mapper/PI layer. So the
target family vocabulary is not an invention - it can be derived from an authority already in
production, which is the cheapest and safest possible source.

## B02-B06 — GLOBAL VARIANT DISCOVERY, TESTED BY DIMENSION

Method: instead of enumerating SKUs, test every dimension in which global variation could be
TYPE-level, and ask what the engine actually reads. Composition -> PR. Only a real class -> PI.

| Dimension | What the authority actually does | Verdict |
|---|---|---|
| Fat % (milk, cream, powder) | every gate reads composition; the FR resolver proves the Engine uses the PR's own 3.6 | PR |
| Lactose-free | `computeLactoseSandinessRisk(totals.lactose_g, totals.water_g)`; composition.ts sums `lactose_percent` per component | PR |
| UHT vs pasteurised vs raw | ProductBehavior `processBehavior` on the PR (e.g. UHT_READY_TO_USE -> COLD_PROCESS_OK) | PR |
| Aerating protein | `aerating_protein = percentages.protein_percent` - plain total protein | PR |
| Dairy identity | `is_dairy` FLAG, needed only because composition cannot see dairy fat carrying no lactose (butterfat). A flag on the ingredient, not a type | PR flag |
| Glucose syrup / maltodextrin DE | `src/engine/pac.ts` has an explicit Syrup DE path: non-null `de_value` -> anchor-interpolated PAC | PR |
| Plant source (oat/soy/almond/rice/coconut) | separate `CorrectionFamily` values; different botanical class | **PI (type)** |
| Whey vs milk protein | separate families `whey_protein_concentrate` / `milk_protein_concentrate` | **PI (type)** |
| Individual gums | distinct molecules, each already a neutral row | **PI (type)** |

NOTHING NEW became a type. Every dimension of real global variation in milk / cream / powders is
composition the engine already consumes.

### Additional proliferation found by the same rule (frozen, not migrated)

GLUCOSE SYRUP DRY - SIX rows differing ONLY by DE: 22.5, 27.5, 31, 39, 42, 62.
MALTODEXTRIN      - SIX rows differing ONLY by DE: 10, 11, 11.5, 16.5, 18.5, 30.5.
  The engine interpolates PAC from `de_value`, so DE is composition it already reads. Under the
  corrected rule these twelve identities carry two technological types.
  NOTE for C04: the existing split does not even follow the standard DE-20 boundary - maltodextrin
  rows reach DE 30.5 while glucose syrup starts at DE 22.5, so the two overlap. Whether GLUCOSE SYRUP
  and MALTODEXTRIN are one starch-hydrolysate continuum or two types is a technologist judgement, not
  something this audit should assert.

WHEY PROTEIN CONCENTRATE - WPC 60% (PI-ING-000294) and WPC 80% (PI-ING-000295) differ only by protein
  content. One type, composition in PR. WPC vs MPC remains a genuine type split (separate families).

LOCUST BEAN GUM - PI-ING-001384 and PI-ING-000475 (LOCUST BEAN GUM CAROB) are the same gum, twice.

### Consolidated proliferation ledger (evidence only - Mapper untouched)

  MILK               5 percentage rows  -> 1 type
  GLUCOSE SYRUP      6 DE rows          -> 1 type
  MALTODEXTRIN       6 DE rows          -> 1 type
  WPC                2 protein% rows    -> 1 type
  LOCUST BEAN GUM    2 duplicate rows   -> 1 type
  CREAM              1 neutral (33%) + brand legacy -> 1 type
  Total: 22 identities carrying 6 technological types.

### Family vocabulary standing after B02-B06

Confirmed types, already present: DEXTROSE, FRUCTOSE, SUCROSE, LACTOSE, INULIN, the single gums,
egg yolk / dried egg yolk, starches, plant drinks (oat, rice, almond), coconut, pea/rice protein,
WPC, MPC, GELLATTI STABILIZER.
Confirmed missing: SOY DRINK (neutral) - the vegan authority already names the family `soy_drink`
but only brand rows exist.
Family concepts absent at BOTH layers: CREAM POWDER (sold as GEL-CRP-500, consumed by the rescue
palette via a brand row, and no `cream_powder` CorrectionFamily exists).
Still withdrawn: CARRAGEENAN, generic EMULSIFIER - no profile authority references either.

### C05 PRECONDITION RECORDED (Owner instruction 2026-09-05)

`skimmed_milk_powder` stays as legacy routing authority. Do not rename or refactor any
CorrectionFamily value. Any future collapse to MILK POWDER must FIRST make lever selection in
optimizationFlowRouter composition-aware (low fat / high protein), because that family is the lever
for increase_aerating_protein, increase_solids, decrease_water and decrease_npac, and a merged family
could otherwise hand the optimizer a 26%-fat powder against a HARD fat gate.

## LEDGER CORRECTION (Owner, 2026-09-05)

B02-B06 are GLOBAL REAL-WORLD DISCOVERY tasks and return to ACTIVE. The dimension audit above is NOT
their completion; it is recorded as the TECHNOLOGICAL CLASSIFICATION RULESET that B02-B06 and C01-C03
apply. Real-world discovery still depends on A03. Accepted DONE baseline: 9/36.

## CREAM POWDER DECISION TEST — ANSWER: YES, ABSORBED (no new family)

QUESTION: can CREAM POWDER be safely represented as PI/family = MILK POWDER + exact PR composition?

EVIDENCE 1 - nothing in the engine reads it as a class. `PI-ING-000260` and the toolbox id
  `cream_powder_42` appear in exactly two files: starterPackRescuePalette.ts and
  canonicalToolboxCompositions.ts. No gate, router, CorrectionFamily or production authority
  references cream powder. There is no `cream_powder` family - and no `milk_powder` family either.

EVIDENCE 2 - the palette treats it IDENTICALLY to skimmed milk powder, in both places it appears:
    eligibility  - PI-ING-001645, PI-ING-000270 and PI-ING-000260 are equally `profile_incompatible`
                   for sorbet and vegan_gelato
    seed grams   - the same three all seed at target_batch_grams * 0.01
  Note the third member is DRIED EGG YOLK, which is not a milk powder at all. So the grouping is not
  evidence of a powder family; it is a "dry animal-origin solids seeded at 1%" heuristic.

EVIDENCE 3 - no process difference. mapper_process_metadata for PI-ING-000260, 000270, 000296 and
  001645 is identical: process_decision UNKNOWN, heat_sensitive false, verification_status unknown.

EVIDENCE 4 - the difference is entirely composition the engine already reads:
    SMP          fat 0.8  protein 35.7  solids 89.68
    cream powder fat 42   protein 20    solids 100

CONCLUSION: CREAM POWDER does NOT earn a distinct technological type. It is absorbed, exactly like
whole vs skimmed.

TWO THINGS TO CARRY TO C04, NEITHER DECIDED HERE:
  (a) NAMING. A family literally called MILK POWDER misdescribes spray-dried cream. The honest options
      are to name the family DAIRY POWDER, or to keep MILK POWDER and accept the stretch. Owner call.
  (b) The lever-routing precondition gets STRONGER, not weaker. A merged powder family would span
      0.8% fat (SMP) to 42% fat (cream powder) - a wider spread than the 26% whole-powder case.
      Composition-aware lever selection in optimizationFlowRouter is a hard precondition for any
      collapse, because that family is the lever for increase_aerating_protein, increase_solids,
      decrease_water and decrease_npac against a HARD fat gate.

## C01 / C02 / C03 — CLOSED ON THE CLASSIFICATION RULESET

C01 - every technological variant dimension in the frozen B01 scope compared against existing PI:
      fat%, lactose-free, process, aerating protein, dairy identity, syrup DE, plant source,
      whey vs milk protein, individual gums. Source: engine gates, CorrectionFamily, pac.ts,
      composition.ts, ProductBehavior, mapper_process_metadata.

C02 - FINAL CANDIDATE LIST:
      GENUINE: SOY DRINK (neutral). `soy_drink` is already an engine CorrectionFamily; oat, rice and
      almond peers are neutral; soy exists only as four frozen brand rows on which the vegan toolbox
      currently depends.
      WITHDRAWN: MILK 3.6% (composition), CREAM POWDER 42% (composition), CREAM POWDER as a family
      (absorbed - test above), INULIN (already exists twice), CARRAGEENAN (no authority references it),
      EMULSIFIER (all 25 rows are commercial blends; no standalone emulsifier is referenced).

C03 - decision test applied and evidenced for every candidate: milk, cream, milk powder, cream powder,
      soy drink, inulin, carrageenan, emulsifier. One survives.

CAVEAT RECORDED: these close on the classification RULESET, not on world data. B02-B06 real-world
discovery can add PR instances freely; it can only change C02 by surfacing a genuinely NEW
technological class, which would be raised as a NEW checklist ID rather than silently altering C02.

## UNRESOLVED FOR C04 (do not collapse yet)

GLUCOSE SYRUP vs MALTODEXTRIN. Ranges overlap - maltodextrin reaches DE 30.5 while glucose syrup
starts at DE 22.5 - so the existing split does not follow the standard DE-20 boundary. Whether this is
one starch-hydrolysate continuum or two technological types needs separate classification proof.
Not collapsed, not asserted.

# ============================================================================
# OWNER DECISIONS 2026-09-10 — SHOP / GLOBAL BASE / PDF 0€ (recorded)
# ============================================================================
D-1  Mapper authority for ALL Shop / country-product / PDF work = FINAL_FROZEN 2541
     (Desktop/MAPPER/history/GELLATTI_MAPPER_2541_GC75_FINAL_FROZEN_2026-09-09.xlsx, SHA-256 6db7fbe0…374e002b;
     Desktop/MAPPER/mapper_basement.csv field-identical, 0 / 157 542 differences). The live shared
     mapper_basement (2147) is NOT the authority. SHOP: no Supabase writes, no 2147→2541 sync, no migrations,
     no shared-row edits. The 2147 drift is an integration-handoff item owned by the FINAL 2541 integration.
D-2  PI identity = stable PI-ING ID. A display-name difference never remaps a PI. The final BAZA refreshes
     Mapper-derived names/facts from 2541 by ID. Exact PR facts override PI facts where the routing contract says so.
D-3  C04 resolved FOR SHOP. Existing 2541 PI (incl. percentage/form/grade variants) are grandfathered; their
     existence is not permission to create more. New brand / EAN / package / SKU → PR-ING → best valid EXISTING
     canonical PI → exact PR facts preserved. No existing PI safely fits → REVIEW_REQUIRED → future
     NEW PR/PI-ING INGESTION CONTRACT. SHOP never creates a PI.
D-4  PI-ING-000260, PI-ING-002242 and the soy-drink variants stay as found. GELATO routing uses ONLY the PI
     identities selected by the accepted GELATO base. No base expansion.
D-5  Active routing denominator = 75 markets. Blockers/counters previously based on 249 are recalculated on 75.
     RECEPTURY keeps its internal ISO/world index; not rewritten here.
D-6  The 5 locally missing SA10 artifacts are NOT a SHOP blocker. SHOP does not reconstruct SA10, implement
     SA-11, or modify Search/parser architecture.
D-7  BAZA GELATO v7 = WORKING, NOT FINAL. Allowed now: coverage analysis, exact product / EAN / official-source
     verification, routing evidence, URL collection, evidence classes, PDF 0€ data architecture, gap list.
     Not allowed: calling v7 final, final PDF, final PR IDs, Mapper edits, DB routing writes. On the final BAZA:
     deterministic v7 → final reconciliation that preserves verified evidence.
D-8  Sucrose (ordinary white sugar) = GLOBAL PI. No branded PR. PDF uses the local consumer term. No EAN invented.
D-9  Sorbet / Vegan / Protein bases are outside the current GELATO scope. The architecture must accept them later
     without inventing formulas or PI selections.
D-10 PDF 0€ links store URL, market, product, EAN evidence, evidence date, source type and CONFIRMED / LEAD /
     HYPOTHESIS; BRAK when nothing verified. No silent substitution. Final PDF only after the final BAZA is accepted.
D-11 Live-drift finding preserved (live 2147 vs authority 2541) as an integration handoff only; never used to
     overwrite FINAL_FROZEN data.
D-12 Continue all safe work; only final-BAZA-dependent sub-steps wait.
Finding recorded 2026-09-10: BAZA v7 sheet 06_ZRODLA cites "mapper_basement(10).csv — Aktualny Mapper Basement
2147" as its Mapper source. v7 was built on the live 2147 state, which is why some v7 names differ from 2541.

# ============================================================================
# MASTER CHECKLIST — FULL 36 (checkpoint 2026-09-10, after owner decisions)
# COUNTER TYPE: owner-accepted master items (NOT an implementation counter)
# ============================================================================
PHASE A
[x] A01 Global country/market ledger — SPEC/DECISION ACCEPTED · IMPLEMENTATION NOT STARTED · REVERIFICATION REQUIRED.
        DEP: —  LINKS: Country authority / Shop. NOTE: ISO ledger = vocabulary; commercial scope = accepted 75 (D-5).
[x] A02 MARKET ≠ ORIGIN. DEP: A01. LINKS: PR identity/provenance. EVIDENCE: countryOfOrigin vs markets[]; PL/BE
        dextrose; BAZA v7 carries 'Pochodzenie' separately from 'Kraje użycia'.
[~] A03 Retailers/manufacturers by market — RE-BASED to 75 markets × GELATO (D-5, D-7). Saturation criterion v2 below.
        DEP: A01. LINKS: Product Catalog / Shop.
[~] A04 Exact EAN overlap across countries — 0 CONFIRMED multi-country EANs; v7 multi-country candidates listed in
        reports/a03/baza_v7_multicountry_eans.csv for verification. DEP: A03. LINKS: PR dedup / Shop / Country Product.
[~] A05 Evidence-based market/product clusters — research question; no cluster model frozen. DEP: A04.
PHASE B
[x] B01 Base-product family scope — NOTE: active base = GELATO, 6 PI (000236, 000180, 000270, 000514, 000494,
        000492); Sorbet/Vegan/Protein outside current scope (D-9). DEP: A01.
[~] B02 Milk variants — ruleset recorded; v7 supplies real MILK products for 75 markets. DEP: A03, B01.
[~] B03 Cream / milk powder / cream powder — v7 CREAM + SMP. DEP: A03, B01.
[~] B04 Sugars — v7 DEXTROSE; sucrose = global PI (D-8). DEP: A03, B01.
[~] B05 Inulin / stabilizers / gums — v7 TARA. DEP: A03, B01.
[!] B06 Plant bases / protein (Vegan/Protein) — BLOCKED: those base packages are not supplied and must not be
        invented (D-9). Status changed ACTIVE→BLOCKED on 2026-09-10 with this blocker; nothing deleted.
PHASE C
[x] C01 Variants vs existing PI — closed on the classification ruleset.
[x] C02 Missing PI candidate list — closed on the ruleset.
[x] C03 Technological-meaning proof — closed on the ruleset.
[x] C04 OWNER REVIEW of PI candidates — RESOLVED FOR SHOP by owner decision 2026-09-10 (D-3, D-4): no new PI
        from SHOP; PR → best existing PI; else REVIEW_REQUIRED → future ingestion contract.
[!] C05 Controlled addition of approved neutral PI — BLOCKED / OUT OF SHOP: owned by the future NEW PR/PI-ING
        INGESTION CONTRACT and Mapper maintenance. SHOP never creates PI (D-3).
PHASE D
[x] D01 One exact PR per real EAN — invariant verified on staging sample; re-verify after global PR population.
        RISK kept: GS1 RCN prefixes are not globally unique.
[~] D02 PR stores identity + origin + markets — v7 columns assessed offline.
[~] D03 Manufacturer/label/retailer source facts — verification of v7 sources in progress.
[x] D04 Per-field VERIFIED/DERIVED/ESTIMATED/UNKNOWN truth — capability verified.
[x] D05 Raw basis preserved + normalized values — capability verified.
[~] D06 Bind PR to correct PI — for SHOP: best EXISTING PI by stable ID (D-2, D-3); v7 bindings checked vs 2541.
[~] D07 Engine readiness of required base PR — requires the app/Engine runtime; offline pre-checks only in SHOP.
[~] D08 Missing requirements for every NOT READY PR — compiling from v7 WYMAGA_* statuses (moved TODO→ACTIVE).
PHASE E
[x] E01 Country defaults use the existing Product Country authority.
[x] E02 USER_PREFERRED precedence preserved.
[~] E03 Picker exposes neutral PI names — not advanced by SHOP research (picker lane).
[~] E04 Exact brand/PR via details/search — not advanced by SHOP research.
[~] E05 Scan resolves PR → PI → country/user flow — not advanced by SHOP research (scanner lane).
PHASE F
[~] F01 Shop references the same approved PR — defined in reports/a03/PDF0_DATA_ARCHITECTURE.md (moved TODO→ACTIVE).
[~] F02 Supplier / URL / market availability — link collection (D-10).
[~] F03 PDF 0€ per country/cluster — data architecture prepared; final PDF waits for the final BAZA (D-7, D-10).
[ ] F04 Cluster countries with identical production sets — DEP: A05.
[!] F05 GELATO country base (terminal-valid) — BLOCKED by owner instruction.
[!] F06 SORBET/VEGAN/PROTEIN country bases — BLOCKED by owner instruction and D-9.
PHASE G
[x] G01 Mapper count reconciliation (2088 vs 2089) — DONE as accepted. NOTE 2026-09-10: authority is now
        FINAL_FROZEN 2541 (D-1); live 2147 = integration handoff (D-11).

TALLY: DONE 13 · ACTIVE 18 · BLOCKED 4 · TODO 1 = 36.
MASTER PROGRESS: 13 / 36 = 36.1 %  (C04 moved to DONE on the owner's explicit instruction of 2026-09-10).

# ============================================================================
# A03 SATURATION CRITERION v2 (re-based 2026-09-10; v1 kept above, superseded)
# ============================================================================
Scope: 75 markets × GELATO roles. Roles needing an exact PR: MILK, CREAM, SMP, DEXTROSE, TARA (5 × 75 = 375 cells).
SUCROSE = global PI (75 cells, generic local term, no PR) — counted separately.
S1' CELL CLASSIFICATION  375/375 PR cells carry a status: HAVE-VERIFIED / LEAD / MISSING / UNAVAILABLE.
S2' MARKET COMPLETENESS  75/75 markets have a status for every role. (Replaces v1 "S2 ≥ 8 markets"; the old "3/8"
                         is NOT converted to "3/75" — it measured research breadth, which the v7 dataset supersedes.)
S3' EVIDENCE QUALITY     customer-visible cells = CONFIRMED only; counts of CONFIRMED / LEAD / HYPOTHESIS / BRAK.
S4' EAN INTEGRITY        100 % of v7 EANs checksum-validated or flagged; RCN-range codes flagged; numeric-stored cells
                         checked for leading-zero loss.
S5' MULTI-COUNTRY PROOF  every EAN claimed in > 1 market has an independent official source per market (A04).
S6' OWN-BRAND CHECK      retailer own-brand SKUs identified and never shared across markets without per-market proof.
S7' CLASS DISCIPLINE     every product bound to an existing PI or marked REVIEW_REQUIRED; zero new PI (D-3).


# MASTER CHECKLIST — FULL 36 (checkpoint 2026-09-10 b, after the A04/F02 evidence run)
# COUNTER TYPE: owner-accepted master items (NOT an implementation counter)
# ============================================================================
PHASE A
[x] A01 Global country/market ledger — SPEC/DECISION ACCEPTED · IMPLEMENTATION NOT STARTED · REVERIFICATION REQUIRED.
        DEP: —  LINKS: Country authority / Shop. NOTE: ISO ledger = vocabulary; commercial scope = accepted 75 (D-5).
[x] A02 MARKET ≠ ORIGIN. DEP: A01. LINKS: PR identity/provenance. EVIDENCE: countryOfOrigin vs markets[]; PL/BE
        dextrose; BAZA v7 carries 'Pochodzenie' separately from 'Kraje użycia'.
[~] A03 Retailers/manufacturers by market — 75 × GELATO. Evidence run: 375/375 PR cells classified — CONFIRMED 122
        (CORE 49/100) · LEAD 173 · BRAK 80. S3' and S5' not met → stays ACTIVE. DEP: A01.
        LINKS: Product Catalog / Shop. FILE: reports/a03/A04_EAN_VERIFICATION.md.
[~] A04 Exact EAN overlap across countries — 7 of 33 v7 multi-market EANs CONFIRMED in ≥ 2 markets; 12 in one
        market; 14 in none. RCN codes never a cross-market identity. DEP: A03. LINKS: PR dedup / Shop / Country Product.
[~] A05 Evidence-based market/product clusters — research question; no cluster model frozen. DEP: A04.
PHASE B
[x] B01 Base-product family scope — NOTE: active base = GELATO, 6 PI (000236, 000180, 000270, 000514, 000494,
        000492); Sorbet/Vegan/Protein outside current scope (D-9). DEP: A01.
[~] B02 Milk variants — ruleset recorded; v7 supplies real MILK products for 75 markets. DEP: A03, B01.
[~] B03 Cream / milk powder / cream powder — v7 CREAM + SMP. DEP: A03, B01.
[~] B04 Sugars — DEXTROSE: 19 CONFIRMED · 9 LEAD · 47 BRAK. Sucrose = global PI (D-8): SA10 everyday
        phrase for 44/75 markets, technical name only for 31. DEP: A03, B01.
[~] B05 Inulin / stabilizers / gums — v7 TARA. DEP: A03, B01.
[!] B06 Plant bases / protein (Vegan/Protein) — BLOCKED: those base packages are not supplied and must not be
        invented (D-9). Status changed ACTIVE→BLOCKED on 2026-09-10 with this blocker; nothing deleted.
PHASE C
[x] C01 Variants vs existing PI — closed on the classification ruleset.
[x] C02 Missing PI candidate list — closed on the ruleset.
[x] C03 Technological-meaning proof — closed on the ruleset.
[x] C04 OWNER REVIEW of PI candidates — RESOLVED FOR SHOP by owner decision 2026-09-10 (D-3, D-4): no new PI
        from SHOP; PR → best existing PI; else REVIEW_REQUIRED → future ingestion contract.
[!] C05 Controlled addition of approved neutral PI — BLOCKED / OUT OF SHOP: owned by the future NEW PR/PI-ING
        INGESTION CONTRACT and Mapper maintenance. SHOP never creates PI (D-3).
PHASE D
[x] D01 One exact PR per real EAN — invariant verified on staging sample; re-verify after global PR population.
        RISK kept: GS1 RCN prefixes are not globally unique.
[~] D02 PR stores identity + origin + markets — v7 columns assessed offline.
[~] D03 Manufacturer/label/retailer source facts — EAN × market evidence done for all 375 PR cells; label composition and
        nutrition not verified in this run.
[x] D04 Per-field VERIFIED/DERIVED/ESTIMATED/UNKNOWN truth — capability verified.
[x] D05 Raw basis preserved + normalized values — capability verified.
[~] D06 Bind PR to correct PI — 375/375 v7 PR cells bound to the 6 existing 2541 PI; 0 new PI; 000236/000270 display
        names refresh by stable ID in the final BAZA (D-2).
[~] D07 Engine readiness of required base PR — requires the app/Engine runtime; offline pre-checks only in SHOP.
[~] D08 Missing requirements for every NOT READY PR — compiled: reports/a03/d08_missing_requirements_v7.csv (374 NOT READY
        + 1 READY per v7), joined with the A04 evidence class per cell.
PHASE E
[x] E01 Country defaults use the existing Product Country authority.
[x] E02 USER_PREFERRED precedence preserved.
[~] E03 Picker exposes neutral PI names — not advanced by SHOP research (picker lane).
[~] E04 Exact brand/PR via details/search — not advanced by SHOP research.
[~] E05 Scan resolves PR → PI → country/user flow — not advanced by SHOP research (scanner lane).
PHASE F
[~] F01 Shop references the same approved PR — reports/a03/PDF0_DATA_ARCHITECTURE.md; evidence fields added after the A04 run.
[~] F02 Supplier / URL / market availability — 838 v7 URLs fetched + 46 browser checks; per-cell best URL, source type,
        page market, method and evidence time in reports/a03/a04_ean_verification_v7.csv (D-10).
[~] F03 PDF 0€ per country/cluster — data architecture + working evidence ready; final PDF waits for the final BAZA (D-7, D-10).
[ ] F04 Cluster countries with identical production sets — DEP: A05.
[!] F05 GELATO country base (terminal-valid) — BLOCKED by owner instruction.
[!] F06 SORBET/VEGAN/PROTEIN country bases — BLOCKED by owner instruction and D-9.
PHASE G
[x] G01 Mapper count reconciliation (2088 vs 2089) — DONE as accepted. NOTE 2026-09-10: authority is now
        FINAL_FROZEN 2541 (D-1); live 2147 = integration handoff (D-11).

TALLY: DONE 13 · ACTIVE 18 · BLOCKED 4 · TODO 1 = 36.
MASTER PROGRESS: 13 / 36 = 36.1 %  (no status changes at this checkpoint; text updated for A03 A04 B04 D03 D06 D08 F01 F02 F03).

# A03 SATURATION MATRIX v2 — values at checkpoint 2026-09-10 b (criterion defined above; no aggregate %)
S1' CELL CLASSIFICATION   MET      375/375 PR cells carry an evidence class (CONFIRMED 122 · LEAD 173 · BRAK 80 · HYPOTHESIS 0).
S2' MARKET COMPLETENESS   MET      75/75 markets have a class for every PR role.
S3' EVIDENCE QUALITY      NOT MET  customer-visible (CONFIRMED) today: 122/375 PR cells, CORE 49/100; 19 markets have none.
S4' EAN INTEGRITY         MET      295/295 v7 EAN cells pass GTIN mod-10; 0 numeric-stored; 2 RCN-range codes flagged (TH).
S5' MULTI-COUNTRY PROOF   NOT MET  7/33 multi-market EANs CONFIRMED in ≥ 2 markets; 12 in one; 14 in none.
S6' OWN-BRAND CHECK       PARTIAL  21 retailer-owned-brand cells identified (reviewer token list); every shared one needs per-market proof.
S7' CLASS DISCIPLINE      MET      375/375 bound to existing 2541 PI; 0 new PI; 2 display-name refreshes pending by ID.
A03 stays ACTIVE (S3', S5' not met). L1 unchanged: Vietnam CONFIRMED · Poland LEAD · same EAN in two markets LEAD.
RCN stays a risk only for D01 / A04 / E05.

# ============================================================================

# OWNER UPDATE 2026-09-10 (c) — SHOP / PDF 0€ / STABILIZER ROUTING (recorded)
# ============================================================================
D-13 TARA is no longer a mandatory exact product in every market. Requirement: FUNCTIONAL SLOT = STABILIZER with an
     exact, explicit PI/PR selection per market.
D-14 Search order per market: (1) local verified TARA → (2) local alternative stabilizer already in FINAL 2541 —
     preferred: TARA, GUAR, LBG, the existing verified GELLATTI stabilizer blend/premix; another existing stabilizer PI
     only if technically appropriate → (3) local commercial gelato stabilizer / premix, identified exactly and mapped
     safely → (4) VERIFIED_CROSS_BORDER_FALLBACK → (5) BRAK / REVIEW_REQUIRED.
D-15 Stabilizers are not gram-for-gram substitutes. SHOP delivers discovery, exact identity, EAN/SKU, availability,
     market evidence, purchase URL, manufacturer/supplier data and technical-document discovery. SHOP never sets a
     dosage. An alternative stays CANDIDATE_PENDING_TECHNICAL_READINESS until Engine/Processing clear it; it is never
     called FINAL BASE READY.
D-16 Data model for the position: functional_slot = STABILIZER, with selected_pi_ing, selected_pr_ing,
     selected_product_name, stabilizer_type (TARA | GUAR | LBG | STABILIZER_BLEND | OTHER_EXISTING_APPROVED_STABILIZER),
     EAN/SKU, market, source URL, availability evidence, technical-document URL, evidence class, Engine readiness,
     Processing readiness, final-use status. Types are never collapsed into one ingredient identity.
D-17 Stabilizer evidence classes: CONFIRMED_LOCAL_TARA · CONFIRMED_LOCAL_ALTERNATIVE ·
     LOCAL_ALTERNATIVE_PENDING_TECHNICAL_READINESS · VERIFIED_CROSS_BORDER_FALLBACK · LEAD · BRAK.
     PENDING_TECHNICAL_READINESS never counts as production-ready coverage.
D-18 PDF 0€: the easiest safe LOCAL product outranks cross-border TARA, even when it uses another accepted stabilizer
     PI. The PDF names the product actually selected; it never says TARA when the country base was calculated with
     GUAR / LBG / a blend, or the reverse. Final grams come from the accepted country-base calculation, not from SHOP.
D-19 TARA research is preserved. The search branches: TARA → local alternatives → verified premix → cross-border.
D-20 Identity from FINAL 2541. New product / brand / EAN → new PR candidate → existing PI. No safe existing PI →
     NEW PR/PI-ING INGESTION CONTRACT. SHOP never creates a PI; no Mapper change; no shared-Supabase mutation.
D-21 Continue in parallel: CORE cells, US gaps, DEXTROSE, STABILIZER alternatives, label/product facts, purchase
     links, multilingual sucrose terms, A04/A05. Final PDF still waits for the final accepted BAZA.

SUPERSEDED WORDING (annotation only; nothing above is rewritten)
Wherever earlier text in this file or in reports/a03/ treats TARA as the mandatory GELATO country ingredient —
the A03 saturation criterion v2 role list "MILK, CREAM, SMP, DEXTROSE, TARA (5 × 75 = 375 cells)", checklist line B05
"v7 TARA", the saturation-matrix lines that count TARA, A04_EAN_VERIFICATION.md ("TARA: 0 CONFIRMED …", "TARA
open cells"), PDF0_DATA_ARCHITECTURE.md role lists and the TARA rows of d08_missing_requirements_v7.csv — read it as
STABILIZER SLOT / BEST SAFE LOCAL VERIFIED PRODUCT (D-13 … D-19). The TARA evidence itself stays as recorded.

A03 SATURATION CRITERION v2.1 (amends v2 for D-13; v2 kept above)
The fifth PR role is the STABILIZER slot (5 × 75 = 375 cells unchanged). A STABILIZER cell counts as covered only when
CONFIRMED_LOCAL_TARA, or CONFIRMED_LOCAL_ALTERNATIVE after Engine/Processing clearance. PENDING_TECHNICAL_READINESS,
VERIFIED_CROSS_BORDER_FALLBACK, LEAD and BRAK are reported separately and never counted as production-ready.
# ============================================================================

# OWNER SCOPE CORRECTION 2026-09-10 (d) — STOP INDEPENDENT COUNTRY-BASE PRODUCT SELECTION (recorded)
# ============================================================================
D-22 The Owner is preparing the COMPLETE authoritative Excel with the intended GELATO base/product selections for all
     75 markets. BAZA v7/v9 = WORKING / INCOMPLETE / NOT AUTHORITATIVE FOR MISSING COUNTRIES. The forthcoming Owner
     Excel = the authoritative country-base input.
D-23 Stop independent discovery whose purpose is to choose the milk, cream, SMP, dextrose or stabilizer for a market,
     or to build a replacement country-base product set.
D-24 Research already collected is preserved and labelled RESEARCH_LEAD / VERIFIED_PRODUCT_EVIDENCE /
     VERIFIED_MARKET_EVIDENCE where justified. It is never promoted to the country-base selection unless it matches,
     or is explicitly accepted against, the Owner's final Excel (example: the EU dextrose products found on 2026-09-10
     are evidence/candidates, not the country dextrose selection).
D-25 Until the Excel arrives only selection-independent work continues: PDF 0€ data architecture; evidence schema;
     EAN/GTIN verification tooling; identifier typing; market/locale structure; source/evidence quality rules;
     consumer-language terms (ordinary white sugar); reusable link/evidence capture; reconciliation tooling (Owner Excel
     vs Mapper 2541); the 75-market verification checklist; preparation of the Engine 10/10 validation pipeline.
     Evidence for products ALREADY present in the working Excel may be verified; no discovery budget is spent on
     filling missing selections.
D-26 When the Owner Excel arrives, for every market and selected product: (1) exact PI-ING, (2) exact PR-ING where
     applicable, (3) brand/product/EAN/SKU, (4) market availability, (5) source/evidence, (6) technical readiness,
     (7) reconciliation against FINAL_FROZEN 2541, (8) only genuine gaps/errors, (9) a selection that cannot be verified
     is reported back — never silently replaced. Only then is an alternative chosen. STABILIZER: the D-14 fallback
     hierarchy applies only when the Owner-selected stabilizer cannot be verified/used — never pre-emptively.
D-27 Final country validation: exact country products → actual PI/PR facts → Engine/Solver → score 10/10 → freeze
     exact country grams → versioned country recipe/base. No country base is FINAL before 10/10.
Consequences (recorded, nothing deleted):
- The stabilizer-slot and CORE-gap research of checkpoint (c) is reclassified as research evidence. None of its
  candidates is a selection; "best candidate" fields are evidence rankings only.
- Research candidates never count toward A03 coverage. Only products listed in the working Excel that are verified count
  as working evidence, and even those stay pending the Owner Excel.
- The research agents still doing discovery were stopped when this correction arrived; partial results are kept.
# ============================================================================

# CHECKPOINT 2026-09-10 (d) — owner scope correction applied (D-22..D-27)
# ============================================================================
# MASTER CHECKLIST — FULL 36 (checkpoint 2026-09-10 d, after the owner scope correction)
# COUNTER TYPE: owner-accepted master items (NOT an implementation counter)
# ============================================================================
PHASE A
[x] A01 Global country/market ledger — SPEC/DECISION ACCEPTED · IMPLEMENTATION NOT STARTED · REVERIFICATION REQUIRED.
        DEP: —  LINKS: Country authority / Shop. NOTE: ISO ledger = vocabulary; commercial scope = accepted 75 (D-5).
[x] A02 MARKET ≠ ORIGIN. DEP: A01. LINKS: PR identity/provenance. EVIDENCE: countryOfOrigin vs markets[]; PL/BE
        dextrose; BAZA v7 carries 'Pochodzenie' separately from 'Kraje użycia'.
[~] A03 Retailers/manufacturers by market — D-22/D-23: discovery for missing selections STOPPED; the Owner's complete Excel is the
        selection authority. Working-Excel products with market evidence: 125/375 (CORE 52/100). Research kept as evidence
        (118 products) and never counted as coverage. DEP: A01, Owner Excel.
[~] A04 Exact EAN overlap across countries — working-Excel products: 7/33 multi-market EANs confirmed in ≥ 2 markets (unchanged);
        research evidence shows 3 more (evidence only). RCN never a cross-market identity. DEP: A03.
[~] A05 Evidence-based market/product clusters — shared-EAN graph on working-Excel evidence: CZ-HR-HU-RO-SI-SK · DK-NO-SE · EE-LT-LV ·
        BE-NL · GB-IE; candidate view only, no cluster frozen. DEP: A04.
PHASE B
[x] B01 Base-product family scope — NOTE: active base = GELATO, 6 PI (000236, 000180, 000270, 000514, 000494,
        000492); Sorbet/Vegan/Protein outside current scope (D-9). DEP: A01.
[~] B02 Milk variants — ruleset recorded; working-Excel MILK with market evidence 41/75; selection awaits the Owner Excel
        (D-22). DEP: A03, B01.
[~] B03 Cream / milk powder / cream powder — working-Excel CREAM 33/75, SMP 32/75 with market evidence;
        selection awaits the Owner Excel (D-22). DEP: A03, B01.
[~] B04 Sugars — working-Excel DEXTROSE 19/75 with market evidence; research dextrose kept as evidence only.
        Sucrose (D-8): retailer-printed local term for 28 markets + SA10 phrase for 44; 3 without evidence. DEP: A03, B01.
[~] B05 Inulin / stabilizers / gums — STABILIZER slot (D-13); per D-26 the fallback hierarchy runs only if the Owner-selected
        stabilizer fails. Research evidence kept (34 stabilizer products with verified market evidence); 71 existing PIs catalogued.
        DEP: A03, B01.
[!] B06 Plant bases / protein (Vegan/Protein) — BLOCKED: those base packages are not supplied and must not be
        invented (D-9). Status changed ACTIVE→BLOCKED on 2026-09-10 with this blocker; nothing deleted.
PHASE C
[x] C01 Variants vs existing PI — closed on the classification ruleset.
[x] C02 Missing PI candidate list — closed on the ruleset.
[x] C03 Technological-meaning proof — closed on the ruleset.
[x] C04 OWNER REVIEW of PI candidates — RESOLVED FOR SHOP by owner decision 2026-09-10 (D-3, D-4): no new PI
        from SHOP; PR → best existing PI; else REVIEW_REQUIRED → future ingestion contract.
[!] C05 Controlled addition of approved neutral PI — BLOCKED / OUT OF SHOP: owned by the future NEW PR/PI-ING
        INGESTION CONTRACT and Mapper maintenance. SHOP never creates PI (D-3).
PHASE D
[x] D01 One exact PR per real EAN — invariant verified on staging sample; re-verify after global PR population.
        RISK kept: GS1 RCN prefixes are not globally unique.
[~] D02 PR stores identity + origin + markets — v7 columns assessed offline.
[~] D03 Manufacturer/label/retailer source facts — label-fact presence recorded (d03_label_facts_presence_v7.csv); EAN/market
        evidence tooling in reports/a03/tooling.
[x] D04 Per-field VERIFIED/DERIVED/ESTIMATED/UNKNOWN truth — capability verified.
[x] D05 Raw basis preserved + normalized values — capability verified.
[~] D06 Bind PR to correct PI — the reconciler checks role ↔ PI against 2541: working v7 450/450 consistent, v9 75/75; 0 new PI.
[~] D07 Engine readiness of required base PR — requires the app/Engine runtime; offline pre-checks only in SHOP.
[~] D08 Missing requirements for every NOT READY PR — working-Excel list in d08_missing_requirements_v7.csv; the final gap list =
        REPORT_BACK rows of the reconciler on the Owner Excel (D-26).
PHASE E
[x] E01 Country defaults use the existing Product Country authority.
[x] E02 USER_PREFERRED precedence preserved.
[~] E03 Picker exposes neutral PI names — not advanced by SHOP research (picker lane).
[~] E04 Exact brand/PR via details/search — not advanced by SHOP research.
[~] E05 Scan resolves PR → PI → country/user flow — not advanced by SHOP research (scanner lane).
PHASE F
[~] F01 Shop references the same approved PR — PDF 0€ row model with selection authority, evidence labels and identifier typing;
        pdf0_working_rows_v7.csv holds working-Excel products only.
[~] F02 Supplier / URL / market availability — reusable evidence tooling (verifier, quote checker, identifier typing) in
        reports/a03/tooling; product URL + evidence per row in pdf0_working_rows_v7.csv (D-10).
[~] F03 PDF 0€ per country/cluster — waits for the Owner Excel, the final BAZA and Engine 10/10 (D-22, D-27); pipeline prepared in
        ENGINE_10_10_VALIDATION_PIPELINE.md.
[ ] F04 Cluster countries with identical production sets — DEP: A05.
[!] F05 GELATO country base (terminal-valid) — BLOCKED by owner instruction; D-27: no country base is FINAL before Engine 10/10.
[!] F06 SORBET/VEGAN/PROTEIN country bases — BLOCKED by owner instruction and D-9.
PHASE G
[x] G01 Mapper count reconciliation (2088 vs 2089) — DONE as accepted. NOTE 2026-09-10: authority is now
        FINAL_FROZEN 2541 (D-1); live 2147 = integration handoff (D-11).

TALLY: DONE 13 · ACTIVE 18 · BLOCKED 4 · TODO 1 = 36.
MASTER PROGRESS: 13 / 36 = 36.1 %  (no status changes; notes updated for A03 A04 A05 B02 B03 B04 B05 D03 D06 D08 F01 F02 F03 F05).

A03 SATURATION MATRIX v2.1 — values at checkpoint (d) (research never counted; no aggregate %)
S1' CELL CLASSIFICATION   MET      375/375 working-Excel PR/slot cells carry a class.
S2' MARKET COMPLETENESS   MET      75/75 markets have a class for every role.
S3' EVIDENCE QUALITY      NOT MET  working-Excel products with market evidence 125/375 (CORE 52/100).
S4' EAN INTEGRITY         MET      v7 295/295 checksum OK; research identifiers typed (GTIN-13 (EAN-13) 56, GTIN-12 (UPC-A) 12, CHECKSUM_FAIL 2, GTIN-14 2, GTIN-8 1, RCN_STORE_INTERNAL (not globally unique) 1, NOT_A_GTIN_LENGTH 1).
S5' MULTI-COUNTRY PROOF   NOT MET  7/33 working-Excel multi-market EANs confirmed in ≥ 2 markets.
S6' OWN-BRAND CHECK       PARTIAL  unchanged.
S7' CLASS DISCIPLINE      MET      only existing 2541 PIs; 0 new PI; reconciler role↔PI v7 450/450, v9 75/75.
# END CHECKPOINT (d)

# OWNER DECISIONS 2026-09-10 (e) — SHOP / 75-MARKET BASE PREPARATION (recorded)
# ============================================================================
D-28 Checkpoint (d) accepted. No independent country-base selection; no filling of missing milk/cream/SMP/dextrose/
     stabilizer slots; research stays evidence only; no new product discovery until the complete Owner Excel arrives.
     The Owner Excel is not requested again. When supplied it is treated as the authoritative intended input,
     reconciled, verified, and every genuine issue reported — no silent substitution.
D-29 CONFIRMED_LOCAL = two independently satisfied facts.
     A. EXACT PRODUCT IDENTITY — the exact GTIN/EAN/UPC on the local page, OR the exact GTIN on another
        authoritative/reliable source PLUS an unambiguous match of brand, product name, variant, package/size and
        (where relevant) formulation to the local listing.
     B. MARKET BINDING — local country retailer/domain, explicit country selector, explicit delivery to the country,
        local legal entity/store, country-specific product page/path, or another direct, credible binding signal.
     A local page without an EAN is not automatically LEAD: it is CONFIRMED_LOCAL only when identity is proven
     independently and the listing ties unambiguously to that exact product. Name similarity alone never confirms.
     Separate fields: exact_product_identity_confirmed · identifier_confirmed · market_binding_confirmed ·
     local_availability_confirmed.
D-30 US: a generic .com domain alone is not US confirmation. US is CONFIRMED only when the exact product is also tied to
     the US (explicit US shipping, US-only/store statement, US country selector, US legal/store entity, US-specific
     path/catalog, a listing clearly serving US customers). Otherwise LEAD.
D-31 Currency alone is not market binding. The 12 currency-only cells stay LEAD until additional binding evidence exists.
D-32 Sucrose consumer words: the 28 terms with direct local-shop evidence are approved. Japan uses グラニュー糖 for the
     generic sucrose / plain granulated white sugar slot; 上白糖 is a different commercial sugar style and never stands in
     for it. Multilingual markets keep every supported locale variant; no single permanent PDF language is forced.
     Routing = MARKET + LOCALE: (1) user/account/session locale when supported, (2) otherwise the explicit market
     default locale, (3) alternate locale versions preserved. The static PDF set may carry several locale variants.
D-33 Engine 10/10 = the real production Solver/Constraint Studio acceptance state in which all required bands/gates of
     the profile are satisfied — not any internal 0–100 metric. Final country validation: exact country product set →
     exact PI/PR facts → exact country grams → actual profile Engine/Solver → all required bands in range → UI/result
     acceptance 10/10 → only then freeze the country base. SHOP does not implement or modify the Engine harness; it may
     prepare schema, input contract, expected output, country validation manifest and test-case structure. The
     implementation belongs to the Engine/Recipe validation workstream after the Owner Excel is reconciled.
D-34 v9 TARA_LOCAL_CONFIRMED ≠ exact product + EAN + market confirmed. The original v9 evidence is preserved; the 15 rows
     are classified separately into local_availability_evidence, exact_product_identity_evidence, identifier_evidence
     and market_binding_evidence. No historical rewrite; no replacement.
D-35 Keep the reconciliation tooling, evidence tooling, identifier typing, locale structure, 75-market checklist and the
     10/10 specification, then PAUSE country-product work until the Owner Excel arrives. No app code, Mapper, Engine or
     Supabase change; no merge/deploy.
Consequences (recorded): currency-only confirmations become LEAD in the working evidence (the original A04 class is kept in
its own column); counters are recomputed; the verifier stops treating currency as market binding; the two-fact fields
are added to the tooling and the evidence files.
# ============================================================================

# CHECKPOINT 2026-09-10 (e) — owner decisions D-28..D-35 applied; country-product work paused
# ============================================================================
# MASTER CHECKLIST — FULL 36 (checkpoint 2026-09-10 e, owner decisions D-28..D-35 applied)
# COUNTER TYPE: owner-accepted master items (NOT an implementation counter)
# ============================================================================
PHASE A
[x] A01 Global country/market ledger — SPEC/DECISION ACCEPTED · IMPLEMENTATION NOT STARTED · REVERIFICATION REQUIRED.
        DEP: —  LINKS: Country authority / Shop. NOTE: ISO ledger = vocabulary; commercial scope = accepted 75 (D-5).
[x] A02 MARKET ≠ ORIGIN. DEP: A01. LINKS: PR identity/provenance. EVIDENCE: countryOfOrigin vs markets[]; PL/BE
        dextrose; BAZA v7 carries 'Pochodzenie' separately from 'Kraje użycia'.
[~] A03 Retailers/manufacturers by market — CONFIRMED_LOCAL = identity ∧ binding (D-29). Working-Excel products: 111/375
        (CORE 50/100); 12 currency-only cells now LEAD (D-31). Research kept as evidence only. Country-product work PAUSED
        until the Owner Excel (D-35). DEP: A01, Owner Excel.
[~] A04 Exact EAN overlap across countries — working Excel: 7/33 multi-market EANs confirmed in ≥ 2 markets (all bound by
        country domains); research evidence shows 3 more (evidence only). RCN never a cross-market identity. DEP: A03.
[~] A05 Evidence-based market/product clusters — shared-EAN graph on working-Excel evidence: CZ-HR-HU-RO-SI-SK · DK-NO-SE · EE-LT-LV ·
        BE-NL · GB-IE; candidate view only, no cluster frozen. DEP: A04.
PHASE B
[x] B01 Base-product family scope — NOTE: active base = GELATO, 6 PI (000236, 000180, 000270, 000514, 000494,
        000492); Sorbet/Vegan/Protein outside current scope (D-9). DEP: A01.
[~] B02 Milk variants — working-Excel MILK CONFIRMED_LOCAL 34/75; selection awaits the Owner Excel (D-22). DEP: A03, B01.
[~] B03 Cream / milk powder / cream powder — working-Excel CREAM 29/75, SMP 29/75 CONFIRMED_LOCAL; selection awaits
        the Owner Excel (D-22). DEP: A03, B01.
[~] B04 Sugars — working-Excel DEXTROSE CONFIRMED_LOCAL 19/75. Sucrose: 28 consumer terms approved (D-32), JP = グラニュー糖;
        multilingual markets keep every locale variant (MARKET + LOCALE). DEP: A03, B01.
[~] B05 Inulin / stabilizers / gums — STABILIZER slot (D-13); fallback only if the Owner-selected stabilizer fails (D-26). v9 TARA
        split (D-34): CONFIRMED_LOCAL 2/15 (IT, HK); the rest are reported back. DEP: A03, B01.
[!] B06 Plant bases / protein (Vegan/Protein) — BLOCKED: those base packages are not supplied and must not be
        invented (D-9). Status changed ACTIVE→BLOCKED on 2026-09-10 with this blocker; nothing deleted.
PHASE C
[x] C01 Variants vs existing PI — closed on the classification ruleset.
[x] C02 Missing PI candidate list — closed on the ruleset.
[x] C03 Technological-meaning proof — closed on the ruleset.
[x] C04 OWNER REVIEW of PI candidates — RESOLVED FOR SHOP by owner decision 2026-09-10 (D-3, D-4): no new PI
        from SHOP; PR → best existing PI; else REVIEW_REQUIRED → future ingestion contract.
[!] C05 Controlled addition of approved neutral PI — BLOCKED / OUT OF SHOP: owned by the future NEW PR/PI-ING
        INGESTION CONTRACT and Mapper maintenance. SHOP never creates PI (D-3).
PHASE D
[x] D01 One exact PR per real EAN — invariant verified on staging sample; re-verify after global PR population.
        RISK kept: GS1 RCN prefixes are not globally unique.
[~] D02 PR stores identity + origin + markets — v7 columns assessed offline.
[~] D03 Manufacturer/label/retailer source facts — the four evidence fields are on every evidence row; label-fact presence recorded;
        national product registers prove identity only.
[x] D04 Per-field VERIFIED/DERIVED/ESTIMATED/UNKNOWN truth — capability verified.
[x] D05 Raw basis preserved + normalized values — capability verified.
[~] D06 Bind PR to correct PI — the reconciler checks role ↔ PI against 2541: working v7 450/450 consistent, v9 75/75; 0 new PI.
[~] D07 Engine readiness of required base PR — requires the app/Engine runtime; offline pre-checks only in SHOP.
[~] D08 Missing requirements for every NOT READY PR — working-Excel list in d08_missing_requirements_v7.csv; the final gap list =
        REPORT_BACK rows of the reconciler on the Owner Excel (D-26).
PHASE E
[x] E01 Country defaults use the existing Product Country authority.
[x] E02 USER_PREFERRED precedence preserved.
[~] E03 Picker exposes neutral PI names — not advanced by SHOP research (picker lane).
[~] E04 Exact brand/PR via details/search — not advanced by SHOP research.
[~] E05 Scan resolves PR → PI → country/user flow — not advanced by SHOP research (scanner lane).
PHASE F
[~] F01 Shop references the same approved PR — row model with the four evidence fields and MARKET + LOCALE keys;
        pdf0_working_rows_v7.csv holds working-Excel products only.
[~] F02 Supplier / URL / market availability — tooling: verifier (four fields; currency never binds), identity_match.py
        (GTIN on an authoritative page + attribute match), quote checker, reconciler (D-10, D-29..D-31).
[~] F03 PDF 0€ per country/cluster — validation manifest schema + template and test-case structure prepared (D-33); final PDF waits
        for the Owner Excel, the final BAZA and production 10/10.
[ ] F04 Cluster countries with identical production sets — DEP: A05.
[!] F05 GELATO country base (terminal-valid) — BLOCKED by owner instruction; FINAL only after production Solver/Constraint Studio
        10/10 — every required band/gate in range (D-27, D-33).
[!] F06 SORBET/VEGAN/PROTEIN country bases — BLOCKED by owner instruction and D-9.
PHASE G
[x] G01 Mapper count reconciliation (2088 vs 2089) — DONE as accepted. NOTE 2026-09-10: authority is now
        FINAL_FROZEN 2541 (D-1); live 2147 = integration handoff (D-11).

TALLY: DONE 13 · ACTIVE 18 · BLOCKED 4 · TODO 1 = 36.
MASTER PROGRESS: 13 / 36 = 36.1 %  (no status changes; notes updated for A03 A04 B02 B03 B04 B05 D03 F01 F02 F03 F05).

A03 SATURATION MATRIX v2.1 — values at checkpoint (e) (research never counted; no aggregate %)
S1' CELL CLASSIFICATION   MET      375/375 working-Excel PR/slot cells carry a class and the four evidence fields.
S2' MARKET COMPLETENESS   MET      75/75 markets.
S3' EVIDENCE QUALITY      NOT MET  CONFIRMED_LOCAL 111/375 (CORE 50/100) after D-31 (12 currency-only cells → LEAD).
S4' EAN INTEGRITY         MET      v7 295/295 checksum OK; identifiers typed; RCN never an identity.
S5' MULTI-COUNTRY PROOF   NOT MET  7/33 working-Excel multi-market EANs confirmed in ≥ 2 markets.
S6' OWN-BRAND CHECK       PARTIAL  unchanged; own-brand listings without a GTIN (CZ Valknut, GR NoCarb) cannot prove identity by GTIN.
S7' CLASS DISCIPLINE      MET      only existing 2541 PIs; 0 new PI.
# END CHECKPOINT (e)

# OWNER DECISIONS 2026-09-10 (f) — FINAL BEFORE PAUSE (recorded)
# ============================================================================
D-36 Matinfo / national product register: may confirm identifier_confirmed = YES, exact_product_identity_confirmed = YES
     and market_binding_confirmed = YES, but does NOT by itself prove local_availability_confirmed. NO milk and NO cream
     (Matinfo) therefore stay NOT CONFIRMED_LOCAL until actual availability/purchase evidence exists. Supersedes the
     checkpoint (e) wording "register proves identity only / pending decision".
D-37 Own-brand without GTIN: a GTIN is not mandatory for exact identity. For a genuine retailer/store own-brand product,
     exact identity may be confirmed without a GTIN when the first-party listing unambiguously proves the own brand/seller,
     the exact product name, the variant, the pack/size, the local listing, and the SKU/article ID where available. No EAN is
     ever invented; identifier_confirmed stays NO when no GTIN exists.
D-38 PAUSE: no product search; no application, Mapper, Engine or database change; wait for the Owner's complete
     75-country Excel.
Applied: register evidence rows carry identifier / exact identity / binding = YES and local availability = NO; working-Excel
CONFIRMED_LOCAL stays 111/375. The v9 rows CZ (Valknut) and GR (NoCarb) are marked D-37-eligible; their assessment waits
for the Owner-Excel verification. The reconciler treats a missing GTIN as a D-37 identity check rather than an error;
checksum failures and store-internal codes remain issues.
# ============================================================================
