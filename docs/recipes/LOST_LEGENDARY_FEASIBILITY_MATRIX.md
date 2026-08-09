# Lost & Legendary — feasibility matrix

Runtime source: `src/data/recipes/curatedCollections.ts`

Publication rule: `PUBLISHED` + reproducible/adaptable + workbench-compatible + zero unavailable Mapper items.

## Counts

- Lost & Legendary candidates: **19**
- Authentic/reproducible: **6**
- Adaptable: **5**
- Research required: **4**
- Rejected / not suitable: **4**
- Currently public: **0**
- Mapper-ready and allowed to open in development preview: **3**

## Matrix

| ID                                          | Status                 | Product representation | Mapper gap / process gate                                                  | Public? |
| ------------------------------------------- | ---------------------- | ---------------------- | -------------------------------------------------------------------------- | ------: |
| aguas-heladas-de-la-mata                    | authentic_reproducible | Sorbet                 | Specific flavour must be mapped, formulated and tested                     |      No |
| glace-au-pain-de-seigle-emy                 | authentic_reproducible | Gelato                 | Rye-bread infusion missing                                                 |      No |
| mughal-persianate-sealed-mould-frozen-dairy | authentic_reproducible | Special process        | Sealed mould + ice/salt, no normal Gelato fallback                         |      No |
| faloodeh-shirazi                            | authentic_reproducible | Sorbet                 | Starch noodles, rosewater and process validation missing                   |      No |
| levantine-anatolian-dovme-booza             | adaptable              | Special process        | Lawful salep and pounding/stretching; konjac loses identity/aroma          |      No |
| heian-amazura-shaved-ice-and-the-lost-syrup | research_required      | Special process        | Verified historical amazura missing                                        |      No |
| nusantara-coconut-pot-frozen-ices           | adaptable              | Vegan                  | PI-ING-000149 mapped; regional identity and kitchen test remain            |      No |
| bastani-sonnati-zaferani                    | adaptable              | Gelato                 | Rosewater, saffron infusion and cream-flake process missing                |      No |
| sorbetto-di-cioccolata-napoletano           | authentic_reproducible | Sorbet                 | PI-ING-000020 mapped; formulation/test remain                              |      No |
| scursunera-gelsomino-siciliana              | research_required      | Sorbet                 | Stronger source and safe jasmine dosage missing                            |      No |
| sharab-maghribi-andalusi-syrup-ice          | research_required      | Special process        | Historical frozen form not established                                     |      No |
| tang-su-shan-frozen-cream-mountain          | adaptable              | Special process        | Historical dairy medium unresolved                                         |      No |
| joseon-tarak-fermented-royal-milk           | research_required      | Gelato                 | Frozen form not historically established                                   |      No |
| karsambac-kar-helvasi                       | adaptable              | Special process        | Ice-shaver workflow is outside current balanced frozen phase               |      No |
| queso-helado-arequipeno                     | authentic_reproducible | Gelato                 | PI-ING-000236/000149/000400 mapped; formulation/test remain                |      No |
| curry-souffles-a-la-ripon                   | not_suitable           | Special process        | **Reject:** fish/savoury product, HACCP burden, no present product value   |      No |
| ambergris-musk-perfumed-ices                | not_suitable           | Special process        | **Reject:** legal/ethical sourcing; substitute destroys identity           |      No |
| egyptian-fermented-barley-buza              | not_suitable           | Special process        | **Reject:** fermented drink/category error, alcohol/HACCP/name collision   |      No |
| pan-asian-shaved-ice-family                 | not_suitable           | Special process        | **Reject:** cultural flattening, no single formula/current workbench phase |      No |

## Adaptation display contract

An adaptable card must show both `Oryginał` and `Adaptacja PINGÜINO`. The original ingredient/process, substitute, effect and authenticity loss remain in runtime data and in the handoff warning. The adapted product is never labelled authentic.

## Lifecycle

`RESEARCHED → MAPPER_READY → FORMULATED → ENGINE_VERIFIED → KITCHEN_TESTED → SENSORY_APPROVED → PUBLISHED`

No shortcut exists. Current pre-publication cards appear only in development and carry the existing pink readiness system.
