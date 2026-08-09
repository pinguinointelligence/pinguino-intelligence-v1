# Protein Gelato Engine specification

Status: **implemented product profile with explicit remaining product gates**
Profile key: `protein_gelato`
Customer label: **Proteinowe**
Default protein target: **20.0 g total protein / 100 g final mix**

## Product contract

Protein Gelato is a distinct product profile. It is not an alias of Standard
Gelato. It uses the shared Base Engine for composition, POD, PAC, NPAC, ice,
nutrition and native violations, while the Protein product layer owns:

- product routing and the Protein target;
- dairy and plant formulation templates for −11°C, −12°C and −13°C;
- bounded target fitting;
- flavour/Main preservation;
- Protein-specific target scoring;
- target UI, persistence and Preview/Apply validation.

The Base Engine formulas are unchanged. Protein adds a product category,
profile bands, explicit ice anchors equal to the already validated Standard
physical anchors, and product-layer orchestration.

## Flavour-first invariant

`lock_type: main` is the canonical flavour identity. The formulator and target
fitter may not remove it, set it to zero, change its grams, or change a
Multi-Main ratio to improve protein fit.

A structural role match is not permission to repurpose Main. For example, a
vanilla dairy paste may broadly map to `primary_liquid`, but it remains the
5 g flavour-defining Main while the approved milk base is added separately.

Priority order used by this implementation:

1. native hard technological validity;
2. actuals, exact locks, constraints and unavailable ingredients;
3. Main identity and Multi-Main ratio;
4. exact batch;
5. requested Protein target;
6. preservation of selected protein-rich foods;
7. protein density as a deterministic tie-break;
8. movement minimization.

## Protein target

The persisted field is `goals.target_protein_percent`.

```text
actualProteinPercent =
  RecipeResult.totals.protein_g / RecipeResult.total_batch_g × 100
```

The value comes from the Base Engine sum of every ingredient's Mapper
`protein_percent`; it is not powder percentage, aerating protein, calories
from protein, or a nutrition claim.

- default: 20.0%;
- input precision: 0.1 percentage point;
- −/+ control step: 1.0 percentage point;
- exact-target tolerance: ±0.1 percentage point;
- lower normalization bound: 0%;
- no invented universal upper bound.

Changing the target only updates canonical recipe state, marks the draft dirty,
increments its revision and invalidates an old Preview. Grams change only after
`Przelicz z PI`.

## Protein Contributor

Protein Contributor and Main are separate concepts. Every ingredient contributes
its verified protein to the actual result, including fruit, cocoa, nuts, milk,
Skyr, WPC, MPC, pea and rice. A contributor is never automatically crowned Main.

Runtime concentrated/food candidates are pinned by canonical Mapper ID:

| ID            | Name                             | Protein % | Route      |
| ------------- | -------------------------------- | --------: | ---------- |
| PI-ING-000237 | Milk Protein Concentrate WPC 75% |      75.0 | dairy      |
| PI-ING-000264 | Protein Gel WPC Sempre230        |      80.0 | dairy      |
| PI-ING-000294 | WPC 60%                          |      60.0 | dairy      |
| PI-ING-000295 | WPC 80%                          |      80.0 | dairy      |
| PI-ING-001395 | Skyr Icelandic Yoghurt           |      12.0 | dairy food |
| PI-ING-001451 | Skyr Fat 0.2%                    |      11.0 | dairy food |
| PI-ING-000451 | Pea Protein                      |      81.7 | plant      |
| PI-ING-000452 | Rice Protein                     |      84.0 | plant      |

Each runtime row is regression-pinned to the versioned Mapper CSV for approval,
verification and complete Engine composition. The implementation does not edit
the Mapper dataset.

A locally present newer Mapper row for high-protein filtered milk is explicitly
`approved_for_engines = FALSE` because its lactase/galactose mapping still
requires review. It is therefore not activated or invented here.

## Selection and fitting policy

The target fitter works on the complete canonical draft and validates every
candidate with the unchanged Base Engine. It:

1. counts natural protein already present;
2. prefers a user-selected protein-rich food over a formulation-added
   concentrate;
3. otherwise uses verified protein-source lines, with higher protein density as
   a deterministic tie-break;
4. solves mass-neutral exchanges first;
5. if needed, performs a bounded coordinated search over protein source,
   fat/body, sucrose, dextrose and water;
6. keeps Main, locks, exclusions, actuals and the batch invariant outside the
   variable set;
7. accepts only candidates that improve target residual and remain native-safe.

The search pool is bounded; it never brute-forces the full ingredient database.
The formulator currently seeds dairy with Protein Gel WPC and plant with Rice
Protein unless the user already selected another verified source.

## Temperature regulator

Protein has three distinct approved settings. The physical envelope reuses the
validated Standard Gelato physics without aliasing the product profile.

| Serving | NPAC native band | Ice native band |   POD |  Fat | Water | Solids |
| ------- | ---------------: | --------------: | ----: | ---: | ----: | -----: |
| −11°C   |            33–42 |         45–54.5 | 12–17 | 5–12 | 57–71 |  29–45 |
| −12°C   |            42–50 |           46–54 | 12–17 | 5–12 | 56–70 |  30–46 |
| −13°C   |            48–55 |           46–52 | 12–17 | 5–12 | 55–69 |  31–47 |

Protein seeds and resulting sugar systems differ across temperatures; they are
not proportional aliases. Native lactose gates are not activated for the
combined dairy/plant Protein profile. Lactose remains calculated and displayed.

## Scoring

The shared technical score remains unchanged. The public Protein adapter adds
the requested-protein residual:

- 10/10 requires native hard safety and protein within ±0.1 pp;
- any target miss is capped below 10;
- a hard-invalid result never receives 10;
- Profile, Monitor, top bar, Recalculate and Overall Score use the same adapter.

Nutrition always displays the actual Engine protein percentage, never the
target.

## Preview, Apply and integrity

The canonical flow is Draft → `Przelicz z PI` → Preview → Apply.

The working-state fingerprint includes goals, so a target-only change makes an
old Preview stale. Apply recomputes native safety and the Protein assessment,
then rejects:

- stale target or formulation;
- target miss without an approved compromise contract;
- native hard violation;
- changed Main identity/ratio;
- duplicate canonical ingredient;
- lock, exclusion, actual or batch violation.

The current implementation intentionally blocks Apply for a safe target miss.
The required explicit, session-bound “Przelicz najlepiej możliwie” consent flow
is not yet implemented; no boolean can bypass Apply.

## Persistence and UI

The target is part of the recipe store, persisted store slice, `RecipeInput`,
recipe payload and saved version snapshot. Legacy inputs restore the 20.0%
default. Reopen/version restore keeps the Protein product and exact target.

Home Goal Setup and Pro Profile use one compact control. The control shows
target and current actual, supports −/+ and direct 0.1 input, and states that
grams change only after PI Preview. Monitor is not redesigned.

## Known incomplete gates

These items keep the overall task status **PARTIAL**:

- explicit best-achievable confirmation and its session-bound consent token;
- exhaustive flavour × source × target × temperature frontier (the committed
  bounded sweep covers Strawberry 10/15/20/22/25/30 at all temperatures and
  complete mandatory 20% fixtures);
- validated interaction with sensory Direction Targets, because sweetness
  shift calibration is partial and creaminess/intensity science is not approved;
- automatic whole-recipe comparison between every alternative protein source;
- Home customer-shell starter registry still needs a Protein starter route;
- browser-level 20→21→20 proof is required before production readiness;
- Base Engine exposes ice fraction but no canonical freezing-point field, so
  the calibration ledger reports FP as not computed rather than fabricating it.
