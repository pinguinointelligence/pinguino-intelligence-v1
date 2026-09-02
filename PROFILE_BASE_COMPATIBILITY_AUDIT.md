# PROFILE / BASE COMPATIBILITY AUDIT

Date: 2026-08-25
Baseline audited: `origin/staging` at `31693f571ba6b208a0aac49ded557b0c2e8713a1`

## Decision

The four customer-visible choices are four native Engine profiles, but they are not four interchangeable formulation bases.

- Gelato is the native dairy Gelato family (`milk_gelato`, with the native chocolate sub-profile when applicable).
- Sorbet is a native water/fruit family (`sorbet`). It cannot inherit a dairy Gelato vector.
- Vegan is a native plant family (`vegan_gelato`). It cannot inherit dairy ingredients.
- Protein is a native profile (`protein_gelato`) with its own qualification and structure authority. Its physical serving envelope intentionally reuses Standard Gelato. Protein supports a dairy route and a separate plant route. Only a dairy-route Gelato ↔ Protein transition is a proven same-family, non-destructive transition.

The runtime decision is therefore composition-aware for Protein. A plant-route Protein recipe is not relabelled as dairy Gelato.

## Profile authority

| Visible profile | Native Engine profile and bands | Native base/template | Required families and eligibility | Approved toolbox / formulation roles | ProductBehavior requirements | Native or transform? | May keep current ingredients? |
|---|---|---|---|---|---|---|---|
| Gelato | `milk_gelato` at −11/−12/−13; `chocolate_gelato` when its real composition selects that native cell | `milk_base_v1`, `milk_base_g17_minus12_v1`, `milk_base_g18_minus13_v1`; chocolate has `chocolate_base_v1` where approved | Native dairy bands; dairy liquid/fat/solids architecture; exact batch; approved stabilizer system; Engine hard bands and critical warnings | Milk, cream, SMP, sucrose, dextrose, Tara; inulin at colder approved bases; customer flavour/Main remains user-owned | Every canonical/private/reference positive line needs a resolved snapshot at persistence/mutation boundaries and eligibility for the active `OPTIMAL`/`ECO` module. Sensory Main also needs matching profile evidence unless it is explicitly user-held | Native | Yes inside Gelato and for dairy-route Gelato ↔ Protein. No for Sorbet/Vegan |
| Sorbet | `sorbet` at −11/−12/−13; dairy gates are deliberately absent | `S01`, `S02`, `S03` | User-selected fruit/Main completes the native scaffold; water, sucrose, dextrose, inulin and approved sorbet stabilizer; native Sorbet water/solids/POD/NPAC/ice bands | Fruit is never invented or auto-added; water, sucrose, dextrose, inulin, Tara are approved structural toolbox roles | Same resolved snapshot/module gate as above; Main policy/envelope when calibrated; final Sorbet stabilizer and native Engine gates remain mandatory | Native | Yes Sorbet → Sorbet only. Any move to/from dairy or Vegan needs a new native base |
| Vegan | `vegan_gelato` at −11/−12/−13; dairy/lactose gates are deliberately absent while plant-fat physics remains | `V02_fixed` for the neutral −13 anchor plus approved neutral/fruit/nut/cocoa/mixed-main templates per temperature | Every ingredient must be `VEGAN_VERIFIED`; contradictory, false or unknown evidence fails closed. Native profile constraints require a stabilizer and enforce the approved inulin envelope | Water, verified plant liquid, verified plant fat, sucrose, dextrose, inulin, Tara; flavour/Main role is selected from the native Vegan strategy | Same resolved snapshot/module gate; Vegan eligibility is independently rechecked from canonical product evidence, so ProductBehavior cannot turn dairy into Vegan | Native | Yes Vegan → Vegan only. Dairy, Sorbet and Protein transitions create a new native base |
| Protein | `protein_gelato` at −11/−12/−13; Standard Gelato physical envelope plus Protein structure/qualification authority | Approved `protein_{dairy|plant}_{strategy}_minus{11|12|13}_v1` templates | Candidate must remain native-band safe and earn HIGH PROTEIN: at least 20% of energy from protein. Protein mass % is an output, not a target. Dairy route uses milk/cream/WPC; plant route uses verified plant liquid/fat/protein | Dairy route: milk, cream, verified protein source, water, sugars, Tara. Plant route: verified plant liquid/fat/protein, water, sugars, Tara. Main/flavour strategy is recipe-aware | Same resolved snapshot/module gate; Protein qualification is independently recomputed from the exact candidate and cannot be waived by ProductBehavior | Native profile; dairy-route Gelato ↔ Protein uses the existing Protein transform/recalc authority. Plant-route Protein remains structurally separate | Dairy route: yes with Gelato. Plant route: only inside Protein. All Sorbet/Vegan crossings require a new native base |

## Compatibility matrix

“Transform” below means the existing approved profile/recalculation authority may operate on the retained vector. “New base” means the source recipe is left intact and a fresh draft is created through `buildCanonicalNewRecipeStarter`; it does not mean changing only the category enum.

| From | To | Same base family? | Keep ingredients? | Transform? | New base required? |
|---|---|---:|---:|---:|---:|
| Gelato | Gelato | Yes | Yes | No | No |
| Gelato | Protein | Yes when the resolved Protein route is dairy; otherwise no | Yes only for dairy route | Yes, through native Protein authority | Only for a plant-route result |
| Gelato | Sorbet | No | No | No in place | Yes |
| Gelato | Vegan | No | No | No in place | Yes |
| Protein | Gelato | Yes for dairy-route Protein; no for plant-route Protein | Yes only for dairy route | Yes for dairy route | Yes for plant route |
| Protein | Protein | Yes | Yes | No | No |
| Protein | Sorbet | No | No | No in place | Yes |
| Protein | Vegan | No | No | No in place | Yes |
| Sorbet | Gelato | No | No | No in place | Yes |
| Sorbet | Protein | No | No | No in place | Yes |
| Sorbet | Sorbet | Yes | Yes | No | No |
| Sorbet | Vegan | No | No | No in place | Yes |
| Vegan | Gelato | No | No | No in place | Yes |
| Vegan | Protein | No | No | No in place | Yes |
| Vegan | Sorbet | No | No | No in place | Yes |
| Vegan | Vegan | Yes | Yes | No | No |

## Runtime routing after the repair

`classifyProfileTransition` reads the current vector, destination native category, approved template registry and Protein route authority.

- Same-family: retain lines, Main/Crown, locks and toppings; change the native profile; require Settings confirmation and normal PI Preview/Apply.
- Different family: do not mutate the current vector. An untouched starter or clean saved source receives an explicit confirmation. Confirming creates a fresh identity with the destination's native starter and `OPTIMAL`. An unsaved edited source is blocked with the exact “save first” action.
- Cancel is byte-preserving.
- The source saved recipe/version is never written by the transition.

## Code evidence

- Native category routing: `src/features/studio/productType.ts`
- Native seeded bands: `src/engine/config/targets.ts`
- Approved templates and recipe-aware Vegan/Protein route selection: `src/features/formulation/templateRegistry.ts`
- Native fresh starter construction and Engine validation: `src/features/recipes/newRecipeStarter.ts`
- Final combined Engine/profile/ProductBehavior gate: `src/features/recipe-constraints/recipeConstraintAuthority.ts`
- Vegan eligibility and structural limits: `src/data/ingredients/veganEligibility.ts`, `src/features/formulation/veganProfileConstraints.ts`
- Protein qualification and formulation authority: `src/features/protein-gelato/proteinQualification.ts`, `src/features/protein-gelato/proteinAuthority.ts`
- Repaired transition classifier and UI: `src/features/pro-workbench/profileCompatibility.ts`, `src/features/pro-workbench/WorkbenchSettingsLine.tsx`

No Engine bands, solver coefficients, Mapper data, Crown rules, Direction science, PAC/POD/NPAC rules or ProductBehavior permissions were changed by this routing repair.
