# Ingredient education source map

Date: 2026-08-08
Purpose: provenance for customer education. Copy and diagrams are original PINGÜINO material; sources supply facts, not wording or competitor design.

## Internal sources

| Education claim                                                                      | Internal source                                                                                           | Allowed use                                                                                            |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mango contributes water, natural sugars and fibre when those components are present. | `EngineIngredient.composition` and current Mapper composition fields.                                     | Select chips from the exact ingredient composition; do not invent an absent dimension.                 |
| Milk may contribute water, lactose, protein and fat.                                 | Engine category/composition and typed lactose/protein/fat fields.                                         | Explain causal roles without exposing target bands.                                                    |
| Pistachio may contribute fat, protein, solids and fibre.                             | Engine category/composition and typed components.                                                         | Explain causal roles; no competitor-style horizontal POD/PAC profile.                                  |
| Sugar types influence sweetness and freezing differently.                            | Engine typed sugar split plus `pod_value`/`pac_value`; `src/engine/types.ts`.                             | Beginner lesson uses only qualitative relative scales; exact POD/PAC stays behind “Wersja techniczna”. |
| Stabilizer behavior depends on exact identity/blend and process.                     | `src/features/formulation/stabilizerDosage.ts`; `docs/product-completion/STABILIZER_SELECTOR_SCIENCE.md`. | Never borrow a blend process/dose for a pure gum or another identity.                                  |
| Current Mapper process data is insufficient for broad heat/cold approval.            | `docs/education/HEAT_PROCESS_DATA_AUDIT.md`.                                                              | Missing evidence → `UNKNOWN`.                                                                          |

## External authoritative / primary sources

| Topic                          | Source                                                                                                                                                                                                                                         | Fact used                                                                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sugars and freezing            | K. E. Smith & R. L. Bradley Jr., _Effects on Freezing Point of Carbohydrates Commonly Used in Frozen Desserts_, Journal of Dairy Science 66 (1983), DOI `10.3168/jds.S0022-0302(83)82112-2`: https://doi.org/10.3168/jds.S0022-0302(83)82112-2 | Different carbohydrates depress the freezing point differently; equal masses are not functionally interchangeable.                                              |
| Stabilizers and ice crystals   | _Cryo-gelation of galactomannans in ice cream model systems_, Food Hydrocolloids: https://doi.org/10.1016/S0268-005X(02)00048-6                                                                                                                | Locust bean and guar gums can support smooth texture and slow crystal growth under temperature fluctuation; exact behavior depends on the system.               |
| Guar hydration / water binding | Mudgil et al., _Guar gum: processing, properties and food applications_, Journal of Food Science and Technology (2014): https://pmc.ncbi.nlm.nih.gov/articles/PMC3931889/                                                                      | Hydration depends on process conditions; guar binds water and is used in ice-cream stabilization. No universal recipe time/temperature is copied into PINGÜINO. |
| E410 plant source              | EFSA, _Re-evaluation of locust bean gum (E 410) as a food additive_: https://doi.org/10.2903/j.efsa.2017.4646                                                                                                                                  | E410 is derived from ground seed endosperm of the carob tree.                                                                                                   |
| E412 plant source              | EFSA, _Re-evaluation of guar gum (E 412) as a food additive_: https://doi.org/10.2903/j.efsa.2017.4669                                                                                                                                         | E412 is ground seed endosperm of the guar plant.                                                                                                                |
| E417 plant source              | EFSA, _Re-evaluation of tara gum (E 417) as a food additive_: https://doi.org/10.2903/j.efsa.2017.4863                                                                                                                                         | E417 is obtained from the seed endosperm of the tara plant.                                                                                                     |
| E-number vocabulary            | Regulation (EC) No 1333/2008 on food additives: https://eur-lex.europa.eu/eli/reg/2008/1333/oj                                                                                                                                                 | EU rules use additive names and/or E-numbers as identifiers. The presence of an E-number alone does not establish synthetic origin.                             |

## Content boundaries

- No protected target ranges, scoring formulas, solver weights or correction logic are included.
- Relative sugar scales are deliberately qualitative and are not Engine coefficients.
- “Stabilizator pochodzenia roślinnego” is shown only for an exact supported identity: tara/E417, guar/E412 or locust bean/E410.
- A commercial or unknown blend never inherits that label from a possible component.
- The future PINGÜINO blend remains PINK `FORMUŁA W PRZYGOTOWANIU`; no composition is asserted.
- No health benefit claims are made for inulin.
- No exact process time or temperature is created from general literature.
