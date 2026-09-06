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

## Multi-country EAN signal (LEAD — needs official confirmation, not hard evidence yet)
  5900820012434 (Laciate 3,5%) is recorded in Open Food Facts with countries_tags = en:philippines.
  Poland is its home market, so the same EAN appears on at least two markets — and PH is one of the
  18 rows in catalog_market_countries. AGGREGATOR source: must be confirmed on an official PH
  retailer/importer page before it counts.
  Contrast: 8402001047251 (Hacendado) returns HTTP 404 from Open Food Facts — consistent with a
  retailer own brand that never leaves its chain.

## Philippines follow-up — LEAD NOT UPGRADED
  koryaiko.com sells "LACIATE UHT Milk 3.5% 1L x 12 Bottles" at PHP 1,056/case, so the PRODUCT is
  present on the PH market. But the page shows NO EAN and NO country of origin, and the seller
  describes itself as official distributor of coffee machines, not of Laciate. Therefore:
  PRODUCT PRESENCE IN PH = evidenced. SAME-EAN-ACROSS-MARKETS = still only an aggregator lead.
  url https://koryaiko.com/product/laciate-uht-milk-3-5-1l-x-12-bottles/

## STRUCTURAL FINDINGS (the main A03 result)

### F1 — B01 splits into TWO supply channels, and they behave oppositely
  RETAIL DAIRY (milk, cream): bought in supermarkets, consumer EAN, sourced nationally.
  PRODUCTION INGREDIENTS (dextrose, inulin, SMP, cream powder, fructose, dried egg yolk):
  a few international bulk manufacturers -> national repackers -> consumer packs.
  Evidence: BENEO makes chicory inulin in Oreye (BE) and Pemuco (CL) and reaches 80+ countries, while
  the PL consumer inulin is repacked by Swojska Piwniczka and declares COUNTRY OF ORIGIN = BELGIA.
  CONSEQUENCE: country work does NOT have the same cost in both channels. Retail dairy needs
  per-country sourcing. Production ingredients share a handful of upstream sources worldwide, so the
  saving in A05 will come from the upstream layer, not from EAN identity.

### F2 — Industrial production ingredients have NO consumer EAN
  Mlekovita's cream powder 42% is a 25 kg sack sold by weight; its official page publishes no EAN.
  D01 ("one exact PR identity per real EAN/SKU") therefore cannot cover the professional half of the
  Starter Pack scope. Those products need an identity key that is NOT an EAN
  (manufacturer + product code + pack size). Raised as a gap, not fixed here.

### F3 — market != origin, systematically, within ONE seller
  Swojska Piwniczka: dextrose origin BELGIA, inulin origin BELGIA, skimmed milk powder origin POLSKA.
  All three sold on the PL market by the same repacker. A02 is not an edge case; it is the norm in
  this channel.

### F4 — own brand vs manufacturer brand decides multi-country potential
  Hacendado (Mercadona own brand) EAN 8402001047251: not present in Open Food Facts at all.
  Laciate (Mlekpol manufacturer brand) EAN 5900820012434: product evidenced on the PH market.
  Retailer own brands do not travel; manufacturer brands do. Clusters (A05) must therefore be built on
  MANUFACTURER brands, never on the apparent pan-European reach of a chain's own label.

### F5 — label gaps land exactly on the technically decisive field
  inulin 1 kg: FIBRE not declared, on a fibre product.
  fructose 500 g: no EAN, no ingredients, no origin, no kJ, no sugars.
  Mlekovita milk 3,2%: no ingredients list on the manufacturer page.
  This is the D03/D04/D08 workload made concrete: the missing facts are not decorative.

### F6 — Starter Pack pack sizes are not always purchasable
  GEL-INU-500 is a 500 g inulin. The PL supplier sells 250 g and 1 kg only. Local sourcing must be
  allowed to differ in pack size, or the Starter Pack spec must tolerate it.

### NEW TECHNOLOGICAL CLASS CANDIDATES FOUND: NONE
  All seven verified products fall inside existing classes and differ only by composition. The
  classification ruleset survived first contact with real market data. C02 unchanged.
