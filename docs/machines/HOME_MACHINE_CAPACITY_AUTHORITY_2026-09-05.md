# Home Machine Capacity Authority — 2026-09-05

Catalog version: `2026-09-05.1`

Scope: the 10 active Home machines in `MACHINE_CATALOG`

Evidence policy: current official manufacturer product pages, support pages, manuals, and FAQs only.

## Interpretation rules

- Physical vessel, maximum liquid input, maximum batch/cycle, and finished-product capacity are different facts.
- `recommendedBatchGrams` is Gellatti operating guidance derived by the existing versioned 0.95 Home rule. It remains editable and is also the per-container split basis.
- `hardMaximumBatchGrams` is populated only from direct manufacturer grams or an explicit Owner-approved volume-to-mass authority. No audited manufacturer states a hard gram ceiling, so it is `null` for all 10 machines.
- A documented volume/MAX FILL ceiling can make `trueHardMaximumDocumented` true without creating a gram ceiling. No `1 ml = 1 g` assumption is made.
- `null` means the cited source did not establish that fact. It is not zero and is not inferred from a neighboring field.

## Audited authority matrix

| Machine                                  |                         Physical vessel |  Gellatti recommended batch |                                Manufacturer maximum liquid mix | MAX FILL / fill rule                                                              |                  Maximum batch / cycle |                      Finished product | Vessels | True hard maximum documented? | Hard maximum grams | Module        |
| ---------------------------------------- | --------------------------------------: | --------------------------: | -------------------------------------------------------------: | --------------------------------------------------------------------------------- | -------------------------------------: | ------------------------------------: | ------: | ----------------------------- | -----------------: | ------------- |
| Ninja CREAMi NC302EU                     |                                  473 ml |                       450 g |                                                        unknown | Do not pass the tub MAX FILL line unless a Ninja recipe explicitly says otherwise |                       473 ml authority |                               unknown |       2 | Yes, marked line (volume)     |            unknown | Frozen Pint   |
| Ninja CREAMi Deluxe NC502EU              |                                  706 ml |                       670 g |                                                        unknown | 24 fl oz MAX FILL line; minimum half full                                         |               706 ml catalog authority |                               unknown |       2 | Yes, marked line (volume)     |            unknown | Frozen Pint   |
| Ninja CREAMi Scoop & Swirl NC7 / NC701EU |                                  480 ml |                       460 g |                                                        unknown | 16 fl oz MAX FILL line; minimum half full                                         |               480 ml catalog authority |                               unknown |       2 | Yes, marked line (volume)     |            unknown | Soft Dispense |
| Moulinex Freezi MJ803AF0                 |                                 unknown |                       950 g | 1000 ml for ice cream/frozen yogurt; 1200 ml for frozen drinks | Program input ranges: 550–1000 ml and 550–1200 ml                                 |    1000 ml normal frozen-dessert cycle | 1400 ml frozen-drink product capacity |       1 | Yes, program volume ceiling   |            unknown | Compressor    |
| Sage Smart Scoop BCI600 / SCI600         |                                 1000 ml |                       950 g |                                                        unknown | none established                                                                  |                                unknown |                               unknown |       1 | No                            |            unknown | Compressor    |
| Magimix Gelato Expert                    |                        2000 ml per bowl | 950 g Gelato; 1240 g Sorbet |        1000 ml Gelato working quantity; 1300 ml Sorbet/granita | Half bowl for Gelato; two-thirds for Sorbet                                       | 1000 ml Gelato; 1300 ml Sorbet/granita |               1000/1300 ml by program |       2 | Yes, program/fraction ceiling |            unknown | Compressor    |
| Cuisinart ICE-100                        |                                 1500 ml |                       950 g |                                about 1000 ml for an own recipe | Keep liquid at least 4 cm below the rim                                           |               1000 ml own-recipe input |                       1500 ml dessert |       1 | Yes, volume/clearance ceiling |            unknown | Compressor    |
| KitchenAid 5KSMICM                       | 1900 ml finished-product bowl authority |                      1330 g |                                                 1400 ml batter | 1400 ml batter maximum                                                            |                                1400 ml |                     1900 ml ice cream |       1 | Yes, volume ceiling           |            unknown | Frozen Bowl   |
| Cuisinart ICE-21                         |    physical brim volume not established |                      1330 g |                                                        unknown | none established in recorded evidence                                             |      Recipe must yield 1400 ml or less |                               1400 ml |       1 | Yes, recipe-yield ceiling     |            unknown | Frozen Bowl   |
| Cuisinart ICE-30                         |                                 2000 ml |                      1430 g |                                                 1500 ml liquid | No more than 1500 ml and at least 2 cm below rim                                  |                                1500 ml |                2000 ml frozen dessert |       1 | Yes, volume/clearance ceiling |            unknown | Frozen Bowl   |

## Official sources

### Ninja

- NC302EU: [official Spanish 473 ml tub product bundle](https://www.sharkninja.es/ninja-creami-6-funciones-pack-ahorro-6-tarrinas/NC302EUBES.html); [official NC300 manual with MAX FILL rule](https://support.ninjakitchen.co.uk/hc/en-gb/article_attachments/5111589338524/NC300UK_IB_Sheet.pdf).
- NC502EU: [official Spanish 706 ml tub product bundle](https://www.sharkninja.es/ninja-creami-deluxe-10-funciones-pack-ahorro-4-tarrinas/NC502EUBES.html); [official Deluxe FAQ with 24 fl oz line](https://support.ninjakitchen.co.uk/hc/en-gb/articles/12401063191964-NC501UK-Ninja-CREAMi-Deluxe-FAQs); [official recipe demonstrating the NC502EU MAX FILL line](https://www.sharkninja.es/sorbete-de-pina/REC4658EU.html).
- NC7 / NC701EU: [official Spanish product page with two 480 ml tubs](https://www.sharkninja.es/ninja-creami-scoop-swirl-12-funciones-2-tarrinas-grisnegro/NC701EU.html); [official Swirl FAQ with 16 fl oz line](https://support.ninjakitchen.co.uk/hc/en-gb/articles/21277995722396-NC701UK-Series-Ninja-CREAMi-Swirl-Ice-Cream-Maker-FAQs).

### Compressor machines

- Moulinex Freezi: [official MJ803AF0 product/manual page](https://www.moulinex.es/instrucciones-de-uso/coccion-electrica/helados/heladera-freezi-prepara-helados-y-bebidas-heladas-al-momento-5-programas-automaticos-silenciosa-8-raciones-blanca/csp/8010001501); [official current instructions](https://dam.groupeseb.com/m/4992c4f36c96c2f3/original/8020013190-IFU-pdf.pdf).
- Sage Smart Scoop: [official BCI600 product page](https://www.sageappliances.com/en-gb/product/BCI600?sku=BCI600UK); [official BCI600/SCI600 EU manual](https://assets.sageappliances.com/BCI600/SCI600_EU_UG8_F23_FA_Online.pdf).
- Magimix Gelato Expert: [official product page](https://www.magimix.com/en/gelato-expert/112-gelato-expert-5018399116801.html); [official capacity/fill FAQ](https://www.magimix.com/en/faq?category=10).
- Cuisinart ICE-100: [official EU product page](https://www.cuisinart.eu/en/cuisinart-ice-cream-gelato-professional-ICE100E.html); [official manual](https://www.cuisinart.eu/on/demandware.static/-/Sites-master-eu/fr_FR/v1773615795596/information-booklets/EU/ICE100E%20-%20Notice.pdf).

### Frozen-bowl machines

- KitchenAid 5KSMICM: [official product page](https://www.kitchenaid.co.uk/mixer-attachments/859711690400/ice-cream-maker-5ksmicm-white).
- Cuisinart ICE-21: [official EU product page](https://www.cuisinart.eu/en/cuisinart-cool-scoops-ice-cream-maker-ICE21E.html); [official manual](https://www.cuisinart.eu/on/demandware.static/-/Sites-master-eu/fr_FR/v1776330276668/information-booklets/ICE21E_Manual.pdf).
- Cuisinart ICE-30: [official EU product page](https://www.cuisinart.eu/en/cuisinart-ice-cream-maker-2l-ICE30BCE.html); [official manual](https://www.cuisinart.eu/on/demandware.static/-/Sites-master-eu/default/v1776589445503/information-booklets/EU/ICE30BCE%20-%20Notice.pdf).

## Formulation authority

All Home machines route to the existing −11 °C Engine cell. The module is a lower-priority Hybrid Beam preference inside the unchanged native band:

- Frozen Bowl: midpoint between the native lower boundary and lower clean-center boundary.
- Compressor: lower clean-center boundary.
- Frozen Pint: neutral; no extra search objective.
- Soft Dispense: midpoint between the upper clean-center boundary and native upper boundary.

Hard safety and constraints remain authoritative. Explicit customer Direction is ranked before module preference. Crown is also ranked before the module; neutral proximity follows it. The declared Soft Dispense creaminess `+1` remains metadata because the existing Engine marks sensory creaminess as blocked science; no fat proxy or new formula is introduced.

Preparation facts remain separate: Frozen Bowl pre-freezes the bowl, Frozen Pint and Soft Dispense pre-freeze the mixture, and Compressor uses active refrigeration.
