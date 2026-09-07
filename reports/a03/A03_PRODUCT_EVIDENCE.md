# A03 — PRODUCT EVIDENCE LEDGER (research only, no functional change)

Checked: 2026-09-05. Branch claude/pl-country-product-set. Staging SHA 6197820e (read-only).
Source types: MANUFACTURER = producer's own site · OFFICIAL_SHOP = the brand's own shop ·
RETAILER = chain site · AGGREGATOR = lead only, never hard evidence on its own.

## Verified products

### 1. Glukoza krystaliczna (dekstroza) 500 g
manufacturer/brand   Swojska Piwniczka (repacker)
exact name           GLUKOZA KRYSTALICZNA DEKSTROZA 500g
market / channel     PL / swojskapiwniczka.pl (own shop)
own-brand?           repacker own brand
EAN                  5902751322798
pack                 500 g · powder
COUNTRY OF ORIGIN    BELGIA  (market PL, origin BE — A02 case)
class (existing)     DEXTROSE — PI-ING-000494
label                1551 kJ / 365 kcal · fat 0 · sat 0 · carb 91 · sugars 91 · protein 0.0
NOT declared         salt, fibre
url                  https://swojskapiwniczka.pl/kosmetyki-naturalne/glukoza-krystaliczna-dekstroza-500g-swojska-piwniczka
source type          OFFICIAL_SHOP
same EAN elsewhere   none found
ruleset              CONFIRMS (composition only)

### 2. Mleko w proszku odtłuszczone 500 g   [Starter Pack spec GEL-SMP-500]
manufacturer/brand   Swojska Piwniczka (repacker)
market / channel     PL / own shop
EAN                  5902751323894
pack                 500 g · powder
COUNTRY OF ORIGIN    POLSKA
class (existing)     SKIMMED MILK POWDER — PI-ING-000270
label                1563 kJ / 368 kcal · fat 1.5 · sat 0.8 · carb 55.0 · sugars 51 · protein 34.0 · salt 1.0
NOT declared         fibre
url                  https://swojskapiwniczka.pl/swojska-piwniczka-produkty-firmowe/mleko-w-proszku-odtluszczone-500g-swojska-piwniczka
source type          OFFICIAL_SHOP
ruleset              CONFIRMS. PI-ING-000270 carries fat 0.8 / protein 35.7; this real product is
                     fat 1.5 / protein 34.0. Same technological type, different composition — exactly
                     the case the corrected rule says belongs to PR.

### 3. Inulina z cykorii 1 kg
manufacturer/brand   Swojska Piwniczka (repacker)
market / channel     PL / own shop
EAN                  5902751321531
pack                 1 kg · powder   (NO 500 g size — Starter Pack GEL-INU-500 cannot be filled here)
COUNTRY OF ORIGIN    BELGIA
class (existing)     INULIN — PI-ING-000456
label                848 kJ / 210 kcal · fat 0 · sat 0 · carb 8 · sugars 8 · protein 0.0 · salt 0.0
NOT declared         FIBRE — on a fibre product. The technically decisive field is absent.
url                  https://swojskapiwniczka.pl/blonnki-i-inne/inulina-z-cykorii-blonnik-1kg-swojska-piwniczka
source type          OFFICIAL_SHOP
ruleset              CONFIRMS type; exposes a D04/D08 evidence gap.

### 4. Mleko Polskie 3,2% tł. (pasteryzowane) 1 L
manufacturer/brand   Mlekovita (manufacturer brand)
market / channel     PL / mlekovita.com.pl
EAN                  5900512850016
pack                 1 L · liquid · PET
class (existing)     MILK — nearest PI-ING-000201 (3.2%, protein 3.2)
label per 100 ml     253 kJ / 60 kcal · fat 3.2 · sat 2.0 · carb 4.7 · sugars 4.7 · protein 3.2 ·
                     salt 0.10 · Ca 105 mg · P 90 mg · K 155 mg · B12 0.40 ug
NOT declared         fibre; INGREDIENTS LIST ABSENT from the manufacturer page
process              PASTEURISED (not UHT)
url                  https://mlekovita.com.pl/produkt/mleko-polskie-3-2-tl-butelka-pet-1-l-13
source type          MANUFACTURER
ruleset              CONFIRMS

### 5. Śmietanka Polska 30% UHT 330 ml
manufacturer/brand   Mlekovita
market / channel     PL / mlekovita.com.pl
EAN                  5900512904443
pack                 330 ml · liquid · UHT
class (existing)     CREAM — nearest PI-ING-000180 (30%, brand-named Mlekovita)
label per 100 ml     1204 kJ / 292 kcal · fat 30 · sat 20 · carb 3.2 · sugars 3.2 · protein 2.3 · salt 0.10
ingredients          smietanka, bialka mleka, stabilizator: karagen
NOT declared         fibre
url                  https://mlekovita.com.pl/produkt/smietanka-polska-30percent-921
source type          MANUFACTURER
ruleset              CONFIRMS

### 6. Śmietanka w proszku 42%   [source of the Starter Pack GEL-CRP-500 spec]
manufacturer/brand   Mlekovita
market / channel     PL + export / mlekovita.com.pl (industrial range)
EAN                  **NONE PUBLISHED** — industrial 25 kg sack, sold by weight
pack                 25 kg (also 1000 kg big bag)
class (existing)     absorbed by the powder class — PI-ING-000260 is literally "CREAM . Mlekovita Cream" 42%
production           spray-dried from sweet, pasteurised, NORMALISED cream
stated use           semi-finished product for the food industry, "mainly as an additive for ICE CREAM
                     and confectionery" — i.e. the Mapper row traces to a real industrial ingredient
NOT published        EAN, protein, lactose, moisture, solids, ash
url                  https://mlekovita.com.pl/pl/produkt/szczegoly/produkty-w-proszku/smietanka-w-proszku-25-kg
source type          MANUFACTURER
ruleset              CONFIRMS absorption. Also proves the industrial-EAN problem below.

### 7. Fructose 500 g   [Starter Pack spec GEL-FRU-500]
manufacturer/brand   Radix-Bis "Zywnosc naturalna"
market / channel     PL / radix-bis.pl
EAN                  **NOT PUBLISHED on the page**
pack                 500 g
class (existing)     FRUCTOSE — PI-ING-000496 (solids 99.803)
label                398 kcal · fat 0 · carb 99.8 · protein 0 · salt 0
NOT declared         EAN, ingredients, origin, energy kJ, saturates, sugars, fibre
url                  https://radix-bis.pl/en/produkt/fructose-500g/
source type          OFFICIAL_SHOP
ruleset              CONFIRMS type (carb 99.8 vs PI solids 99.803) but CANNOT become a PR identity:
                     D01 requires an exact EAN and none is published.

## Products already on staging (seeded by the canonical country-milk work, independently sourced)
  Laciate Mleko UHT 3,5% 1 L    Mlekpol      EAN 5900820012434  PL  manufacturer brand
  Leche entera Hacendado 1 L    Mercadona    EAN 8402001047251  ES  RETAILER OWN BRAND
  Lait frais entier Alsace Lait Alsace Lait  EAN 3262970109108  FR  manufacturer brand (regional)

## EVIDENCE CLASSIFICATION

Every statement below is tagged. CONFIRMED means it follows DIRECTLY from a source I fetched.
LEAD means a real signal that needs a better source. HYPOTHESIS means a reading of the data that
this first pass does NOT yet support. Saturation has not been reached, so most structure is
hypothesis.

### CONFIRMED — directly from the fetched source

C1  The five EANs above and their printed label panels, pack sizes and prices.
C2  Country of origin as PRINTED: dextrose BELGIA, inulin BELGIA, skimmed milk powder POLSKA -
    all three sold on the PL market by the same repacker.
C3  Mlekovita's "Smietanka w proszku 42%" page describes a 25 kg sack, spray-dried from sweet
    pasteurised NORMALISED cream, stated use "mainly as an additive for ice cream and confectionery",
    and THAT PAGE publishes no EAN and no protein/lactose/moisture/solids/ash.
C4  The Radix-Bis fructose 500 g page publishes no EAN, no ingredients and no origin.
C5  The inulin 1 kg page does NOT declare FIBRE, although the product is a fibre.
C6  The Mlekovita milk 3,2% page carries no ingredients list.
C7  Open Food Facts returns HTTP 404 for EAN 8402001047251 (Hacendado) -> NO RECORD IN THAT ONE
    SOURCE. Nothing more. It says nothing about where the product is or is not sold.
C8  Laciate UHT 3.5% 1 L is offered for sale on the PH market (koryaiko.com, PHP 1,056 per case).
    PRODUCT PRESENCE only: the page shows no EAN and no origin.
C9  BENEO extracts chicory inulin at Oreye (Belgium) and Pemuco (Chile) - beneo.com.
C10 PI-ING-000270 carries fat 0.8 / protein 35.7; the real PL skimmed milk powder is fat 1.5 /
    protein 34.0. Same technological class, different composition.

### LEAD — real signal, insufficient source

L1  Same EAN across markets. Open Food Facts records 5900820012434 (Laciate) under
    countries_tags = en:philippines, and PH is one of the 18 rows in catalog_market_countries.
    The PH distributor page does not show an EAN, so SAME-EAN-ACROSS-MARKETS IS NOT PROVEN.
    To close: an official PH importer or retailer page printing the barcode.
L2  BENEO's "80+ countries" reach - trade press, not a primary BENEO statement I fetched.
L3  Schwarz Group (Lidl + Kaufland) operating in 33 countries, ~14,500 stores - trade press and
    Wikipedia, no primary Schwarz source fetched, and NO product-level evidence at all.
L4  Inulin pack sizes at this supplier appear to be 250 g and 1 kg with no 500 g, which would not
    match Starter Pack GEL-INU-500. Taken from search listings, not from a fetched category page.

### HYPOTHESIS — NOT established by this pass

H1  "B01 splits into two supply channels that behave oppositely" (retail dairy sourced nationally vs
    production ingredients flowing from a few international bulk makers through national repackers).
    Coherent with C2 and C9, but built on ONE repacker in ONE market.
    To test: the same origin/repacker pattern in 2-3 further markets and categories.
H2  "Industrial production ingredients have no consumer EAN." n = 1 (C3). One 25 kg sack proves
    nothing about the class.
    To test: sucrose, gums, dried egg yolk, whole milk powder and protein ingredients in industrial
    formats, from at least two manufacturers each.
H3  "D01 (one PR per EAN) cannot cover the professional half of the Starter Pack." Depends entirely
    on H2. Withdrawn as a finding until H2 is tested. NOT raised as a ledger item yet.
H4  "Retailer own brands do not travel; clusters must be built on manufacturer brands." C7 only shows
    an absent OFF record, and C8 only shows one manufacturer-brand product on one foreign market.
    This is the A05 question, not its answer.
    To test: check own-brand EANs of a chain that genuinely operates in many countries (Lidl, Aldi,
    Carrefour) against those chains' own national sites.
H5  "Market != origin systematically." CONFIRMED for the three products in C2; the generalisation to
    the channel is not.
H6  "Label gaps land on the technically decisive field." CONFIRMED for the three products in
    C4/C5/C6; whether it is a pattern needs a larger sample.

### NEW TECHNOLOGICAL CLASS CANDIDATES FOUND: NONE
All seven verified products fall inside existing classes and differ only by composition (C10 is the
clearest case). The ruleset was not contradicted. With n = 7 this is consistency, not proof - C02
stays unchanged either way, since a new class would be raised as a NEW candidate with full evidence.

### A04 READINESS - HONEST STATE
There is currently NO hard-confirmed EAN proven present in more than one country. A04 has eight EANs
to work from and one open lead (L1) with a defined way to close it. The own-brand vs manufacturer-brand
split that A05 would use is H4, a hypothesis, not an input.

# ============================================================================
# A03 SATURATION CRITERION (defined 2026-09-05, before further research)
# ============================================================================
A03 may move from ACTIVE to DONE only when ALL of S1-S7 hold. Coverage is counted, not judged.

S1 CATEGORY COVERAGE   each of the 13 B01 families: >= 3 CONFIRMED products from >= 2 independent
                       manufacturers/repackers.
S2 MARKET COVERAGE     >= 8 markets with >= 1 CONFIRMED product each.
S3 CHANNEL COVERAGE    each family: >= 1 CONFIRMED retail-channel product AND >= 1 CONFIRMED
                       professional/industrial product, or a documented absence of that channel.
S4 EAN-PRESENCE TEST   >= 10 professional/industrial products checked for published EAN, so H2 is
                       settled either way.
S5 MULTI-COUNTRY TEST  >= 5 EANs each checked against >= 2 independent national sources, so A04 gets
                       a real positive or negative.
S6 OWN-BRAND TEST      >= 3 own brands of genuinely multi-country chains, each checked on >= 2 of
                       that chain's national sites, so H4 is settled.
S7 NEW-CLASS SWEEP     every CONFIRMED product classified against the ruleset; any candidate raised
                       with full evidence as a NEW id.

## COVERAGE AGAINST THE CRITERION (this pass)
S1  0 / 13 families at threshold.  Confirmed products per family: milk 3, cream 1, skimmed milk
    powder 1, whole milk powder 1, cream powder 1, dextrose 1, inulin 1, fructose 1,
    sucrose 0, gums 0, dried egg yolk 0, plant drinks 0, protein ingredients 0.
S2  3 / 8 markets (PL, ES, FR by CONFIRMED product; VN adds a confirmed sale of a PL product).
S3  0 / 13 families have both channels confirmed.
S4  3 / 10 checked (Mlekovita cream powder 42% - no EAN published; Radix-Bis fructose - none;
    Swojska Piwniczka whole milk powder 1 kg - none, AND THIS ONE IS A RETAIL PRODUCT).
S5  1 / 5 EANs cross-checked (5900820012434, positive).
S6  0 / 3 own brands checked on national chain sites.
S7  10 CONFIRMED products classified, 0 new candidates.
ESTIMATED SATURATION: roughly 12%. A03 stays ACTIVE.

# ============================================================================
# PASS 2 EVIDENCE
# ============================================================================

### 8. Sữa tươi nguyên kem Laciate hộp 1L  — L1 CLOSED
manufacturer/brand   Mlekpol / Laciate (manufacturer brand)
market / channel     VIETNAM / suatuoi.com (specialist milk retailer)
EAN                  5900820012434  — PRINTED AS TEXT ON THE PAGE
pack                 1 L
COUNTRY OF ORIGIN    Poland (stated), manufacturer Mlekpol (stated)
price                29,100 VND per unit / 325,000 VND per 12-case
label shown          275 kJ · protein 3.2 · fat 3.5 (sat 2.3) · carb 4.7 · sugars 4.7 · sodium 0.1 ·
                     calcium 120 mg  — consistent with the Polish label
url                  https://suatuoi.com/laciate/laciate-full-cream-1l
source type          RETAILER (one source)
CLASSIFICATION       **CORRECTED — see the split below.** My previous wording said CONFIRMED on two
                     markets while also saying single source. Those cannot both be true.

### 9. Mleko w proszku pełne tłuste 1 kg
manufacturer/brand   Swojska Piwniczka (repacker)
market / channel     PL / own shop
EAN                  **NOT PUBLISHED ON THE PAGE**
pack                 1 kg · powder · price 31,99 zl
COUNTRY OF ORIGIN    Polska
ingredients          100% pelne mleko w proszku
label                2085 kJ / 499 kcal · fat 26 (sat 18) · carb 38 · sugars 38 · protein 26 · salt 0.9
NOT declared         fibre, EAN
class (existing)     WHOLE MILK POWDER — PI-ING-000296 (fat 26 / protein 26): EXACT match on both
url                  https://swojskapiwniczka.pl/pl/p/MLEKO-W-PROSZKU-PELNE-TLUSTE-1Kg-SWOJSKA-PIWNICZKA/36922
source type          OFFICIAL_SHOP
CLASSIFICATION       CONFIRMED product; and it CUTS AGAINST MY OWN H2 — see below.

### 10. GS1 RESTRICTED CIRCULATION NUMBERS — a standards fact, not a market observation
source               GS1 documentation, incl. "Summary of GS1 Prefixes 20 - 29 by GS1 Member
                     Organisation" and the General Specifications change notes
                     https://www.gs1.org/docs/barcodes/SummaryOfGS1MOPrefixes20-29.pdf
                     https://www.gs1.org/docs/barcodes/GSCN-23-006-RCN.pdf
what it says         GS1 Member Organisations may assign prefixes 02 and 20-29 for Restricted
                     Circulation Numbers (RCN) "for use within a given geographic region or for use
                     within a company". **These prefixes are NOT GLOBALLY UNIQUE.** Distribution of
                     items marked this way is restricted to a region or a single company.
observed instance    Pilos "Mleko UHT 1,5%" 1 L, store Lidl, country Poland, code **20820268** —
                     8 digits, prefix 20. Other Lidl own-brand codes seen in the same source:
                     20085964, 20782542. (Code format observed via Open Food Facts = AGGREGATOR;
                     the GS1 RULE itself is CONFIRMED from the standards body.)
CLASSIFICATION       GS1 rule: **CONFIRMED**. Own-brand use of RCNs: **LEAD** pending a direct check
                     on a chain's own national site.

# ============================================================================
# CLASSIFICATION CHANGES FORCED BY PASS 2
# ============================================================================

H2 "industrial production ingredients have no consumer EAN" — **WEAKENED, close to refuted as
   stated.** The Swojska Piwniczka WHOLE MILK POWDER 1 kg is a RETAIL consumer product and its page
   also publishes no EAN, while the same shop's dextrose, inulin and skimmed milk powder pages do.
   So the real variable is PAGE COMPLETENESS, not industrial vs retail. Restating the observation
   correctly: "some product pages do not publish an EAN" — which says nothing about whether the
   product carries one. I will stop writing "product has no EAN" and write "page does not publish
   an EAN". S4 continues, but the hypothesis it was testing is already the wrong hypothesis.

H4 "own brands do not travel / clusters must use manufacturer brands" — **still HYPOTHESIS**, but it
   now has a mechanism worth testing rather than a single absent OFF record: own-brand items may be
   numbered with RCNs that are not globally unique.

NEW RISK (raised, not decided) — **RCN COLLISION RISK FOR D01 AND A04.**
   D01 is "one exact PR identity per real EAN/SKU". That invariant currently holds on staging because
   all 11 real EANs there are manufacturer-prefixed. If own-brand products enter the catalogue, their
   codes may be RCNs, which the standards body states are not globally unique. Consequences:
     - two different products in two countries could legitimately share one code;
     - an EAN appearing in two markets would NOT prove the same product — it could be a collision,
       which is a direct trap for the whole A04 overlap exercise;
     - the Scanner path (E05) would resolve such a code ambiguously.
   This is a deduction from a CONFIRMED standard, not a claim about our data. It needs an Owner
   decision only if own-brand products are ever admitted; it is recorded here, not raised as a
   checklist ID, and nothing is changed.

# ============================================================================
# L1 CORRECTION — EVIDENCE SPLIT PER MARKET (no fact changed, status lowered)
# ============================================================================
The claim under test: "EAN 5900820012434 is the same product on two markets."

VN SIDE — CONFIRMED
  source        https://suatuoi.com/laciate/laciate-full-cream-1l   (fetched 2026-09-05, by me)
  EAN visible   YES — "5900820012434" printed as text on the page
  sale proof    listed for sale in Vietnam, 29,100 VND per unit / 325,000 VND per 12-case
  states        origin Poland, manufacturer Mlekpol; panel 275 kJ, protein 3.2, fat 3.5 (sat 2.3),
                carb 4.7, sugars 4.7, sodium 0.1, calcium 120 mg
  source class  RETAILER, single

PL SIDE — NOT INDEPENDENTLY CONFIRMED BY ME
  EAN visible   I have NOT fetched any Polish source showing this EAN. I never opened
                mlekpol.com.pl for it.
  what exists   (a) the staging seed script scripts/seed-staging-canonical-country-milk.mjs lists
                    mlekpol.com.pl and apothikiseven.com as its sources — project-internal record,
                    authored by another lane, not verified by me;
                (b) an Open Food Facts record — AGGREGATOR.
  sale proof    none fetched by me for the PL market at this EAN.

RESULTING STATUS
  "EAN 5900820012434 sold in Vietnam, origin Poland"            -> CONFIRMED (one source)
  "the SAME EAN is on the Polish-market pack"                   -> **LEAD**, not confirmed
  "the same EAN is evidenced on two markets"                    -> **LEAD**, DOWNGRADED from
                                                                   CONFIRMED. The contradiction is
                                                                   removed by lowering the status,
                                                                   not by rewording it.
  To close: fetch mlekpol.com.pl (or another official PL source) and read the EAN off the Polish
  pack. Until then A04 has ZERO confirmed multi-country EANs, exactly as before this pass.

S5 COUNTER CORRECTED: 0 / 5 EANs cross-checked against >= 2 independent national sources.
  (Previously written as 1 / 5. That was the same overstatement.)

AGGREGATE SATURATION FIGURE WITHDRAWN. The "roughly 12%" line has no formula behind it — S1-S7 are
different kinds of test with no defined weighting, so no single percentage is meaningful. Only the
S1-S7 matrix is reported from here on.
