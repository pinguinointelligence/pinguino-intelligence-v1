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
