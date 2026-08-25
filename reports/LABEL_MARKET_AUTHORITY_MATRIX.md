# Label Market Authority Matrix

Verification date: 2026-08-25  
Scope: retail/prepacked gelato plus the explicit UK PPDS and operational-label distinctions exposed by Gellatti.  
Meaning of `PRINT_READY`: the market is selectable and the application can pass its retail preflight. It is not a claim of government approval or a substitute for operator/legal review.

## Release classification

| Market                  | Profile/version                      |     Application status | PRINT_READY | Exact reason                                                                                                                                                                                        |
| ----------------------- | ------------------------------------ | ---------------------: | ----------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| European Union          | `EU-FIC-1169-2021-v2026-08-25`       |  VERIFIED / selectable |         YES | EU declaration renderer, ACTUAL batch authority, language/review/allergen/date/operator/geometry gates and system print are implemented.                                                            |
| United Kingdom          | `UK-FIC-PPDS-2026-08-25`             |  VERIFIED / selectable |         YES | UK declaration renderer and explicit prepacked/PPDS/loose context are implemented; PPDS keeps name, ingredients and emphasised allergens.                                                           |
| United States           | `US-21CFR101-NF-2026-08-25`          | RESEARCH / unavailable |          NO | Distinct Nutrition Facts QA renderer exists, but FDA rounding and prescribed format-family selection are not complete enough for retail output. It is disabled before label creation.               |
| Canada                  | `CA-FDR-NFT-FOP-2026-08-25`          | RESEARCH / unavailable |          NO | Bilingual NFT and 10/15/30% FOP threshold evaluation exist. Retail output is disabled because the approved Health Canada FOP EPS artwork package has not been supplied; no look-alike is generated. |
| Australia / New Zealand | `FSANZ-1.2.8-2024-10-29-v2026-08-25` |  VERIFIED / selectable |         YES | Separate NIP renderer with serving and per-100 g columns plus mandatory core nutrient/data gates is implemented.                                                                                    |
| Custom / other          | `custom-2026-08-09`                  | RESEARCH / unavailable |          NO | No jurisdiction has been selected and verified; requirements are never guessed.                                                                                                                     |

## European Union

Primary authority:

- [Consolidated Regulation (EU) No 1169/2011](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02011R1169-20250401), consolidated text accessed 2026-08-25.
- [European Commission: mandatory food information](https://food.ec.europa.eu/food-safety/labelling-and-nutrition/food-information-consumers-legislation/mandatory-food-information_en), accessed 2026-08-25.

| Topic                           | Rule represented in Gellatti                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Languages                       | Operator selects languages understandable in the destination market; every selected language is required and explicitly reviewed. National-language choice remains the operator's responsibility.                                               |
| Mandatory consumer fields       | Name/legal name, descending actual ingredient declaration, allergen declaration, nutrition, net quantity, operator/address, storage, date mark and LOT. Origin/customer note/logo are optional unless the operator's case makes them mandatory. |
| Nutrition                       | Separate EU per-100 g declaration: energy, fat, saturates, carbohydrate, sugars, protein and salt; fibre/alcohol appear only when established/applicable. Missing saturated fat or sugars fails the market nutrition gate.                      |
| Allergens                       | Frozen canonical evidence is required. Annex II allergens are emphasised in the ingredient declaration; unknown/missing evidence blocks retail print.                                                                                           |
| Ingredient order / QUID         | ACTUAL completed grams determine descending order and percentages. User must review QUID relevance before final print. Compound source text remains bound to frozen authority.                                                                  |
| Quantity / identity             | Metric net mass and operator/address are required. Name, quantity and alcoholic strength field-of-vision obligations are recorded in the profile/layout review.                                                                                 |
| Date / LOT / storage            | No shelf life is invented. Manual/validated date basis and review, automatic immutable LOT and storage in every label language are required.                                                                                                    |
| Origin / alcohol / instructions | Conditional fields remain operator-reviewed. No fake origin, ABV or instruction is generated.                                                                                                                                                   |
| Minimum type / fit              | Profile records 1.2 mm minimum x-height and conservative minimum label geometry. Physical output uses mm. This is a software preflight, not physical-device or legal certification.                                                             |
| Exemptions                      | No exemption is assumed automatically. Retail preflight uses the full conservative field set.                                                                                                                                                   |

## United Kingdom

Primary authority:

- [GOV.UK/FSA: food labelling—giving food information to consumers](https://www.gov.uk/guidance/food-labelling-giving-food-information-to-consumers), accessed 2026-08-25.
- [GOV.UK: food labelling and packaging](https://www.gov.uk/food-labelling-and-packaging), accessed 2026-08-25.
- [FSA: PPDS labelling guidance](https://www.food.gov.uk/business-guidance/prepacked-for-direct-sale-ppds-allergen-labelling-changes-for-businesses), accessed 2026-08-25.

| Topic                  | Rule represented in Gellatti                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Languages              | English is required by the profile.                                                                                                                                                    |
| Prepacked              | Name, ingredients/allergens, QUID review, net quantity, date, UK-relevant FBO/importer physical address, storage/instructions, nutrition and LOT are gated conservatively.             |
| PPDS                   | Explicit `ppds` context is persisted and printed. Name plus full ingredient list with emphasised allergens remains required.                                                           |
| Loose/non-prepacked    | Explicitly identified as a different purpose/context; it is not presented as a complete retail prepacked label. Allergen information remains required.                                 |
| Operator/address       | The profile requires a physical operator/importer address. The application does not infer whether a particular address satisfies GB/NI placement rules; this is part of market review. |
| Nutrition              | UK per-100 g declaration is separate from US/Canada/AU renderers.                                                                                                                      |
| Type / field of vision | 1.2 mm x-height is recorded. Name, net quantity and applicable ABV grouping remains part of layout/operator review.                                                                    |

## United States

Primary authority:

- [21 CFR 101.3—identity](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.3), accessed 2026-08-25.
- [21 CFR 101.4—ingredients](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.4), accessed 2026-08-25.
- [21 CFR 101.5—manufacturer/packer/distributor](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.5), accessed 2026-08-25.
- [21 CFR 101.9—Nutrition Facts](https://www.ecfr.gov/current/title-21/chapter-I/subchapter-B/part-101/subpart-A/section-101.9), accessed 2026-08-25.
- [FDA: sesame is the ninth major allergen](https://www.fda.gov/food/food-allergies/faster-act-sesame-ninth-major-food-allergen), accessed 2026-08-25.

Implemented QA structure: statement of identity, ingredient declaration, metric net quantity, business identity/address, serving description/quantity, servings per container, calories, fat/saturated/trans, cholesterol, sodium, carbohydrate/fibre/total and added sugars, protein, vitamin D, calcium, iron and potassium, plus a major-allergen `Contains` line.

Fail-closed gap: FDA-specific rounding and prescribed format selection for all available-display/serving cases are not complete. The market button is disabled and the final preflight status is `research`; only a visibly watermarked draft can exercise the renderer. Therefore `PRINT_READY=NO`.

## Canada

Primary authority:

- [CFIA: bilingual food labelling](https://inspection.canada.ca/en/food-labels/labelling/industry/bilingual-food-labelling), accessed 2026-08-25.
- [CFIA: presentation of the Nutrition Facts table](https://inspection.canada.ca/en/food-labels/labelling/industry/nutrition-labelling/presentation), accessed 2026-08-25.
- [Health Canada: FOP nutrition symbol industry guide](https://www.canada.ca/en/health-canada/services/food-nutrition/legislation-guidelines/guidance-documents/front-package-nutrition-symbol-labelling-industry.html), accessed 2026-08-25.
- [Health Canada: Compendium of Nutrition Symbol Formats](https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/nutrition-symbol-formats-label-designers.html), accessed 2026-08-25.

Implemented QA structure:

- English and French common/legal names, ingredient blocks, storage text and bilingual NFT headings/order.
- Canadian serving basis, fat, saturated + trans, carbohydrate, fibre, sugars, protein, cholesterol, sodium, potassium, calcium and iron with Canadian DVs.
- FOP evaluation uses the larger of serving/reference quantity, with 10% DV for reference amount at or below 30 g/mL, 15% for general foods, and 30% for main dishes; saturated fat, sugars and sodium are assessed separately.
- Exempt/prohibited states require an explicit documented rationale. Required FOP without an approved asset fails preflight.
- No provincial overlay is invented; no unproven overlay is used as a generic blocker.

Exact blocker: Health Canada publishes the PDF as reference and instructs label designers to request the ready-to-use high-resolution EPS package by email to `smiu-ugdi@hc-sc.gc.ca` with subject `HPFB BNS Compendium of Nutrition Symbol Formats`. The public compendium itself says to use the correct figure supplied in those EPS files. The project has not received that package or reuse authority. An extracted/traced approximation was intentionally not bundled. `PRINT_READY=NO` and Canada is unavailable before the user enters the flow.

## Australia / New Zealand

Primary authority:

- [FSANZ: Food Standards Code legislation](https://www.foodstandards.gov.au/food-standards-code/legislation), accessed 2026-08-25.
- [FSANZ March 2026 Code compilation](https://www.foodstandards.gov.au/sites/default/files/2026-03/Food%20Standards%20Code%20-%20Compilation%20%28March%202026%29_0.pdf), accessed 2026-08-25.
- [FSANZ: allergen labelling](https://www.foodstandards.gov.au/business/labelling/allergen-labelling), accessed 2026-08-25.

| Topic                     | Rule represented in Gellatti                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Languages                 | English required by the current profile.                                                                                                                                 |
| NIP                       | Separate NIP with servings per package, serving size, quantity per serving and per 100 g for energy, protein, total fat, saturated fat, carbohydrate, sugars and sodium. |
| Ingredients/allergens     | Descending ACTUAL mass and frozen allergen evidence; allergen review is mandatory.                                                                                       |
| Other fields              | Legal name, net mass, business/address, date, LOT and storage are gated conservatively. Origin/instructions remain conditional and are never inferred.                   |
| Exemptions/small packages | No exemption is assumed. Unsupported exceptional layouts must remain blocked/reviewed rather than silently using the standard panel.                                     |

## Product and audit invariants

- Retail labels are built from the immutable completed Production ACTUAL snapshot, including top-ups, scale-up and toppings—not the planned recipe.
- Label snapshots freeze content, actual ingredient grams/order, LOT, market/profile version, translations, nutrition, presentation and printer settings.
- Demo/customer-visible formulation rules are unchanged; this label flow belongs to completed owner Production.
- `mapper_basement` was not modified.
- Profiles describe Gellatti's verified implementation status only. The product does not claim FDA approval, CFIA approval, government certification or a legal guarantee.
