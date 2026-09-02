# CANONICAL FAMILY & HONESTY LEDGER

**Owner Final Integration Addendum — Agent A (items 1, 2, 3, 4)**
Branch `agent-a/canonical-families` · base `nightly/integration` @ `fb2924f`
Date 2026-07-25 · Engine `0.4.0` / Config `0.7.0` — **unchanged** (science freeze honoured:
no file under `src/engine/**` was modified, no band, formula, anchor or version touched).

---

## 0. Summary

| Item | Statement | Status |
|---|---|---|
| 1 | `fruit_gelato` is not an approved family; runtime may only select categories with NATIVE seeded bands | DONE |
| 2 | `reference_derived` may never produce an APPLICABLE production recipe | DONE |
| 3 | No "best achievable" claim without a genuine global-optimum proof | DONE |
| 4 | Batch reconciliation is NOT formulation improvement | DONE |

Gates: `npx tsc -b` clean · `npx eslint .` 0 errors (2 pre-existing `react-refresh` warnings)
· `npx vitest run` **386 files / 5244 tests green** (base 385 / 5222 — 1 file and 22 tests
ADDED, none lost) · `npm run build` green · artifacts regenerated from the real pipeline.

---

## 1. `fruit_gelato` is not an approved product family

### What was true before

`src/features/studio/productType.ts:57-64` (base commit) routed a visible Gelato by
ingredient presence with the priority **alcohol > chocolate > nut > fruit > milk**:

```ts
if (detected.alcohol) return 'alcohol_gelato';
if (detected.chocolate) return 'chocolate_gelato';
if (detected.nut) return 'nut_gelato';
if (detected.fruit) return 'fruit_gelato';
return 'milk_gelato';
```

`src/engine/config/targets.ts:46-261` seeds NATIVE bands for exactly **12 cells** —
`milk_gelato`, `chocolate_gelato`, `sorbet`, `vegan_gelato` at −11/−12/−13. Its own header
(`targets.ts:30-31`) states that `fruit_gelato / nut_gelato / alcohol_gelato / other stay
UNSEEDED and keep the documented milk_gelato fallback`. `src/engine/statuses.ts:65` and
`:114-118` implement that fallback:

```ts
const CATEGORY_FALLBACK: ProductCategory = 'milk_gelato';
...
const category_fallback = rows.length === 0;
if (category_fallback) rows = bands.filter((band) => band.category === CATEGORY_FALLBACK);
```

Every result routed to one of the three unseeded gelato cells was therefore scored on
**substituted** bands and permanently flagged `category_fallback: true`, which
`src/features/formulation/violationBands.ts:36-41` classifies as **soft/provisional** — the
single root of the "provisional fruit result" the owner has been fighting.

### What changed

* `src/features/studio/productType.ts`
  * `NATIVE_BAND_CATEGORIES` is **derived from `TARGET_BANDS` itself**
    (`TARGET_BANDS.filter(b => b.status === 'seeded')`). Nothing is hard-coded: seeding a
    new cell in `targets.ts` unlocks that category for runtime with no code change here.
  * `detectClassifications` gained a **`dairy`** discriminator computed from **real
    composition, never names**: `composition.lactose_percent > 0` (the milk-solids marker
    carried by milk / cream / SMP / condensed milk) **OR** the structured
    `flags.is_dairy === true` (the anhydrous-milk-fat case, lactose ≈ 0, dairy fat present).
    Grams are deliberately not part of detection — a SELECTED line at 0 g is a selection PI
    may fill (the frozen zero-gram semantics), so a fruit gelato whose milk line is still
    0 g is a DAIRY gelato, not a sorbet.
  * `gelatoInternalCategory` decision table, every branch NATIVE:
    1. `fruit && !dairy` → **`sorbet`** (the owner rule: a water-based non-dairy fruit
       recipe is a sorbet whatever the selector said — and the sorbet cell is the only
       approved profile whose bands DISABLE the dairy gates);
    2. `chocolate` → **`chocolate_gelato`** (already native, kept);
    3. otherwise → **`milk_gelato`**.
    Alcohol and nuts no longer route anywhere of their own — they are flavour components.
  * new `canonicalInternalCategory(category, items)`: an unseeded category arriving from
    outside the live derivation is re-derived from the real ingredients; a native category
    is returned byte-identical (a no-op for every already-canonical recipe).
* `src/features/studio/buildRecipeInput.ts` — the **single engine seam** every consumer
  crosses ("Monitor, optimizer, `selectCanonicalDraft`, Save, QA", per its own header) now
  canonicalizes: `category: canonicalInternalCategory(state.category, state.items)`. A
  persisted draft, a saved version, a demo preset or a direct `setCategory` write can no
  longer smuggle an unseeded cell into `selectTargetBand`. `category_fallback` is now
  unreachable from any runtime routing choice.

### Structural test

`src/features/studio/canonicalWorkbench.test.tsx` — *"no runtime derivation path can return
a category without NATIVE seeded bands"*: enumerates **every subset** of a 12-ingredient
representative catalogue (4096 line-ups) × every visible product type × all 8 engine
categories, and asserts every result of `gelatoInternalCategory`, `internalCategoryFor` and
`canonicalInternalCategory` is in the engine's own seeded-cell set. The expected set is read
from `TARGET_BANDS` at run time, so **a future seeded cell unlocks the assertion
automatically** with no test edit. Companion pin in
`src/features/constraint-studio/canonicalHonesty.test.ts` ("the native-band list is derived,
never hard-coded" + "every runtime-selectable template targets a NATIVE-banded category").

### Native-vs-fallback impact table (real pipeline, T1–T19)

Measured by running the QA harness before and after. **The band VALUES are identical** —
the fallback *was* the `milk_gelato` band — so the metric shifts below come from the SEED
changing (`fruit_gelato_ref_v1` → the approved `milk_base_v1`, item 2), not from any change
in science.

| Case | Bands before | Bands after | Verdict before | Verdict after | 10-pt | hard-safe |
|---|---|---|---|---|---|---|
| T1 Strawberry EXACT 100 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 9 → 9 | true → true |
| T2 Strawberry EXACT 200 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 9 → 9 | true → true |
| T3 Strawberry EXACT 300 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → 8 | true → true |
| T4 Strawberry EXACT 400 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → 8 | true → true |
| T5 Strawberry EXACT 500 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → 8 | true → true |
| T6 Strawberry EXACT 600 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → 8 | true → true |
| T7 Strawberry EXACT 700 | fallback | **native** | BEST-ACHIEVABLE | BEST-FOUND | 7 → **8** | true → **false** |
| T8 Strawberry EXACT 800 | fallback | **native** | BEST-ACHIEVABLE | BEST-FOUND | 7 → 7 | true → **false** |
| T9 Strawberry EXACT 900 | fallback | **native** | HONEST-IMPOSSIBLE | HONEST-IMPOSSIBLE | 5 → 5 | true → **false** |
| T10 full formulation | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → 8 | true → true |
| T11 Milk EXACT 500 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 9 → 9 | true → true |
| T12 Milk MAX 500 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → **9** | true → true |
| T13 Strawberry RANGE 250–400 | fallback | **native** | BEST-ACHIEVABLE | **OPTIMAL** | 8 → **9** | true → true |
| T14 Sorbet, inulin locked 0 | native | native | OPTIMAL | OPTIMAL | 7 → 7 | true → true |
| T15 SMP EXACT 0 | fallback | **native** | BEST-ACHIEVABLE | BEST-FOUND | 8 → 8 | true → **false** |
| T16 Sucrose excluded | fallback | **native** | HONEST-IMPOSSIBLE | HONEST-IMPOSSIBLE | — | true → **false** |
| T17 Gelato −12 | native | native | OPTIMAL | OPTIMAL | 9 → 9 | true → true |
| T18 Gelato −13 | native | native | OPTIMAL | OPTIMAL | 9 → 9 | true → true |
| T19 Sorbet from fruit | native | native | OPTIMAL | OPTIMAL | 7 → 7 | true → true |

**Counts.** 15 of 19 cases stop being provisional (T1–T13, T15, T16). 10 of them newly reach
`AUTHENTIC-OPTIMAL`, taking the total from 4 to 14 — a verdict the provisional-band rule made
structurally unreachable for fruit before. **Fruit gelato stops being provisional.**

**Material change the owner must know about.** Five cases flip `hardSafe: true → false`
(T7, T8, T9, T15, T16). Their residual violations are the *same numbers as before* — they
are simply now classified **HARD (native)** instead of **SOFT (provisional)**, because they
are measured on the profile's own approved bands. The frozen ACCEPTANCE ADDENDUM 3 door
(`applyPipeline.ts`, `hard_residual_violations`) therefore makes those previews
**diagnostic-only: they can be inspected but no longer applied**. Nothing got worse
numerically; the honesty got stricter. This is a direct, intended consequence of scoring
fruit gelato on real approved science, and it is the main behavioural change an owner
regression pass should look for.

---

## 2. `reference_derived` may never produce an APPLICABLE recipe

### What was true before

`src/features/formulation/templateRegistry.ts:197-203` (base commit) put the
reference-derived seed in the **same array the runtime lookup scanned**:

```ts
const REGISTRY: readonly FormulationTemplate[] = [
  GELATO_M11, GELATO_M12, GELATO_M13, CHOCOLATE_M11,
  SORBET_M11, SORBET_M12, SORBET_M13, VEGAN_M13,
  FRUIT_GELATO_M11,          // status: 'reference_derived'
];
```

`fruit_gelato_ref_v1` (`templateRegistry.ts:179-195`) carries grams transcribed **verbatim
from the goldenRecipes raspberry-premium QA fixture** (fruit 350 / milk 380 / cream 80 /
smp 40 / sucrose 110 / dextrose 35 / tara 5). Any `fruit_gelato` recipe seeded from it, and
the result could become an applicable production recipe as soon as the search stopped or the
batch equalled the target — the Apply door had no provenance gate at all.

### What changed

* **Quarantine** (`templateRegistry.ts`): the registry is split into
  `RUNTIME_REGISTRY` (approved only — the ONLY list `selectFormulationTemplate` scans),
  `QUARANTINED_TEMPLATES`, and `ALL_TEMPLATES` for id resolution. New exports
  `listQuarantinedTemplates()`, `findFormulationTemplateById(id)` and
  `isApprovedTemplateId(id)`. `selectFormulationTemplate` is now **structurally incapable**
  of returning a non-approved template.
* **The trustless door gate** (`applyPipeline.ts`, `VerifiedApply.commit`): a new
  `BlockedApply` code `reference_derived_provenance`. The status is **re-read from the
  registry by the template id the proposal carries** — `preview.formulation.templateStatus`
  is never consulted, and an id present in NO registry is not approved either. Pinned by
  *"the door refuses a reference-derived proposal even when everything else is perfect"*,
  which forges a preview claiming `templateStatus: 'approved'` on the quarantined id and
  proves the door still refuses it.
* **Diagnostic presentation**: `ConstraintPreview.diagnosticReason` (`'hard_residual' |
  'iteration_cap' | 'reference_derived'`); a non-approved seed forces `diagnosticOnly`, and
  `ConstraintPreviewCard` renders `copy.preview.diagnosticReferenceDerived(templateId)` —
  an honest Polish explanation **plus a clear next step** ("Wybierz zatwierdzony profil
  produktu albo wpisz własne gramatury i przelicz ponownie"). Apply is disabled in the card
  and refused again at the door.
* After item 1, `fruit_gelato` cannot occur at runtime at all, so
  `fruit_gelato_ref_v1` is unreachable by **two independent structural facts**.
* The pink **TESTOWE / NIEPRODUKCYJNE** provenance registry is untouched and still green
  (`nonProductionSurfaces.test.tsx`).

### The product gap this exposes (see §5 — owner decision required)

No **approved** `milk_gelato` template carries a `fruit` role. Consequences, handled
honestly rather than by inventing a dose:

* a dairy fruit gelato **with** a fruit amount formulates normally: the fruit is preserved,
  the approved milk template fills every other role, batch equality holds, native bands score
  it (`liveRuntime.test.ts` — "with a real fruit amount it formulates completely on NATIVE
  milk bands");
* a dairy fruit gelato **from zero** cannot be formulated: PI has no approved fruit dose and
  will not invent one. `formulate.ts` now returns an honest `missing_required_role` naming
  the exact ingredient — *"Składnik „STRAWBERRIES · Fresh Fruit" … ma 0 g, a zatwierdzona
  receptura bazowa milk_base_v1 nie zawiera tej roli — PI nie wymyśla dawki składnika
  smakowego. Wpisz ilość, a PI ułoży resztę receptury wokół niej."* This preserves the
  frozen zero-gram guarantee in its strongest form (a chosen ingredient is **never silently
  left at 0 g**) while obeying items 1 and 2.
* A role-less line carrying a §17 **range** now honours that range (the user's own explicit
  bound is an instruction, not invented science), so ranges still steer flavour lines.
* Non-flavour role-less lines (the salt rule) keep the user's amount and produce an honest
  recommendation instead of a stop.

---

## 3. No "best achievable" claim without a global-optimum proof

The optimizer is coordinate descent over a fixed gram ladder
(`draftCandidateVector.ts:63` `DRAFT_ADJUSTMENT_STEP_FRACTIONS`, sweep at `:320`) plus the
engine's bounded correction solver. That proves a **LOCAL verified fixed point**, never a
global mathematical optimum.

| Where | Before | After |
|---|---|---|
| `constraintStudioCopy.previewIssue.bestSafeResult` | „Obecna receptura jest **najlepszym zweryfikowanym wynikiem** dla aktualnych składników i ograniczeń." | „To **najlepszy wynik znaleziony przez obecny solver** dla aktualnych składników i ograniczeń — inne, lepsze rozwiązanie może istnieć poza jego zasięgiem przeszukiwania." |
| `previewIssueMessagePl('best_safe_result')` | the sentence alone | the sentence **+ the exact stop reason** (`Powód zatrzymania: … solver … uruchomiony N ×`) |
| `copy.preview.diagnosticIterationCap` | „…nie jest **dowiedzioną najlepszą osiągalną** recepturą." | „Solver zatrzymał się na limicie iteracji — przeszukiwanie nie zostało zakończone…" |
| `copy.blocked.iterationCapDiagnostic` | same claim | same honest rewrite |
| `copy.en.ts classificationBestSafe` | „najlepszy bezpieczny wynik (best-safe)" | „najlepszy **znaleziony** bezpieczny wynik (best-safe)" |
| QA verdict enum | `AUTHENTIC-BEST-ACHIEVABLE` | **`AUTHENTIC-BEST-FOUND`** |
| QA field | `bestAchievableProof` | `bestFoundProof` |
| QA verdict reason | „…best verified result for these ingredients/constraints." | „…best result **found by the current solver** for these ingredients/constraints." |

The old wording implied that some *other* result IS a proven best-achievable recipe — that is
what made it misleading, not the individual sentence.

`all_bands_in_range` keeps its narrow meaning and is the **only** outcome allowed to say every
approved band is satisfied — and even it is never called a global optimum. `AUTHENTIC-OPTIMAL`
likewise means *zero violations on native approved bands*, a statement about BANDS.

Pinned by `canonicalHonesty.test.ts` — *"no runtime copy string claims a proven best/optimal
result"* scans the **live (non-comment) source** of `constraintStudioCopy.ts` and `copy/en.ts`
for `najlepszym zweryfikowanym wynikiem`, `dowiedzioną najlepszą`, `best achievable`,
`BEST-ACHIEVABLE`; and *"the QA verdict vocabulary carries no best-achievable claim"* scans
`authenticityCases.ts`. Supersession comments are allowed to quote the retired phrasing;
shipped strings are not.

`docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.json` and `.csv` were **regenerated from
the real pipeline** by the artifact-generating test after all changes (15 `AUTHENTIC-OPTIMAL`,
3 `AUTHENTIC-BEST-FOUND`, 2 `HONEST-IMPOSSIBLE`), so the committed artifacts match the
shipped code.

---

## 4. Batch reconciliation is NOT formulation improvement

### What was true before

The CURRENT-DRAFT wave made an off-batch draft (955 g / 1045 g vs 1000 g) produce a real
Preview via `isBatchReconciliation` (`applyPipeline.ts:323-335`). Correct behaviour — but the
preview was titled „Dopasowanie receptury" for *both* a pure rescale and a genuine
technological improvement, and the only distinction was `batchReconciliationOnly`, **a flag
the builder set**.

### What changed

`applyPipeline.ts` gained `PreviewOutcome` / `PreviewOutcomeClassification` and
`classifyPreviewOutcome(before, after)` — pure, and computed inside `finishPreview`, so
**every** preview builder emits it and no path can skip it (the field is REQUIRED on
`ConstraintPreview`, which the compiler enforced across 7 hand-forged fixtures).

Recomputed from the two inputs alone:

* `batchReconciled` — the planned mass really moved AND landed on the target batch;
* `compositionUnchanged` — per-100 g composition identical within 0.01 g/100 g (a pure rescale);
* `engineImproved` — the engine's own measure: fewer violations OR lower weighted severity.

| Outcome | Rendered heading |
|---|---|
| `batch_rescale` | **„Przeskalowano partię"** |
| `engine_optimization` | **„PI zoptymalizowało recepturę"** |
| `batch_rescale_and_optimization` | **„Przeskalowano partię i PI zoptymalizowało recepturę"** (batch first — the owner's order of honesty) |
| `no_verified_change` | neither claim is rendered |

A pure rescale **cannot** produce the optimisation wording by construction: every engine
metric is per-100 g, so a proportional rescale leaves violations and severity untouched and
`engineImproved` is necessarily false. `ConstraintPreviewCard` reads its wording from
`preview.outcomeClassification` and **no longer references `preview.batchReconciliationOnly`
at all** (pinned).

Pins (`canonicalHonesty.test.ts`): *"a PURE rescale is „Przeskalowano partię" and can never say
optimisation"*, *"a REAL engine-verified improvement can never be mislabelled as a rescale"*
(and is byte-equal to a fresh recomputation from the inputs), *"the MIXED case says both,
batch first"*, *"every preview builder emits a classification"*, *"the classification is a pure
function of the two inputs"*.

---

## 5. Deliberate pin updates (every one carries an in-file supersession comment)

| File | Pin superseded | Justification / re-pinned guarantee |
|---|---|---|
| `studio/canonicalWorkbench.test.tsx` | `gelatoInternalCategory(milk+choc+whiskey+fruit) === 'alcohol_gelato'` | Alcohol is a flavour component, not a family. Re-pinned: chocolate still owns the routing, alcohol is still DETECTED, the result is always a NATIVE cell, and none of it ever becomes a visible type. New structural test added. |
| `studio/buildRecipeInput.test.ts` | `input.category === 'fruit_gelato'` | The seam canonicalizes. Re-pinned + new test: every unseeded category canonicalizes, every native one passes byte-identical, non-dairy fruit → sorbet. |
| `formulation/liveRuntime.test.ts` | „produces a REAL differentiated preview" for a 0 g fruit | No approved fruit dose exists after the quarantine. Re-pinned in the strongest form: the fruit is NEVER silently left at 0 g (PI stops and names it), **and** a fruit WITH grams formulates completely on native milk bands from an APPROVED template. |
| `formulation/liveRuntime.test.ts` | Sorbet → Gelato re-routes to `fruit_gelato_ref_v1` | The draft has no dairy, so it stays SORBET (owner rule). Re-pinned + new test 4b: adding real dairy re-routes the same draft to the milk family instantly, no save. |
| `formulation/zeroGramSemantics.test.ts` | „strawberries AND milk both become > 0" | The owner failure was *silence*. Re-pinned as an explicit named stop, plus a second test proving the fill still works once the fruit has an amount. `isEffectivelyLockedLine` semantics unchanged. |
| `formulation/nightlyP0.test.ts` | best-safe copy string; `fruit_gelato_ref_v1` template ids; FAILURE-B fixture at 0 g fruit | Items 1–3. The band-fallback test **deliberately keeps `fruit_gelato`** — it pins the ENGINE mechanism, which still exists for any unseeded cell; a comment says so. |
| `formulation/acceptanceAddendum.test.ts` | `result.templateStatus === 'reference_derived'` (T9) | The guarantee (a reference source can never make a production claim) is now enforced far more strongly — re-pinned as `'approved'` + `isApprovedTemplateId` + "the runtime registry contains approved templates only". |
| `formulation/acceptanceAddendum.test.ts` | provisional 10/10 contract on the T12 *state* | That state is no longer provisional. Re-pinned directly on the engine's fallback mechanism (still correct for unseeded cells) **plus** the new fact that runtime can never reach it. |
| `formulation/formulation.test.ts` | fruit template found via `listFormulationTemplates()` | Quarantined. Re-pinned via `findFormulationTemplateById` / `listQuarantinedTemplates` / `isApprovedTemplateId`, incl. "an unknown id is not approved either". |
| `constraint-studio/currentDraftOptimization.test.ts` | fixture category `fruit_gelato` | Canonical family. **Band values identical** (the fallback WAS the milk band), so every number this suite pins is unchanged. |
| `constraint-studio/staleDraftState.test.ts` | „the 0 g fruit line was FILLED" (×2) + determinism | Re-pinned on BOTH branches: the honest stop names THIS draft's fruit (proving no refresh is needed and no stale padlock survived), then typing an amount immediately formulates to exactly 1000 g. Determinism pinned 10× over both branches. |
| `constraint-studio/applyIntegrity.test.ts` | seed fixture fruit at 0 g; `storeSum() === 5` | The APPLY-path guarantees (byte-for-byte transfer, guarded-write rejections, batch invariant, one-shot apply) are unchanged; the seed just has to be a recipe PI can formulate. The sum assertion is now computed from the untouched lines. |
| `qa/engine-authenticity/engineAuthenticity.test.ts` | the full T1–T19 outcome table + the AUTHENTIC-OPTIMAL membership list | Full deliberate re-pin, generated from the real pipeline. The 10/10 CONTRACT (native bands + zero violations) is unchanged and still asserted as a contract, not only as a list. |
| 7 hand-forged `ConstraintPreview` fixtures | — | `outcomeClassification` is REQUIRED, so a preview cannot exist without a classification. Fixtures declare a neutral one explicitly. |

No guarantee was deleted. Every superseded assertion was replaced by an assertion of the same
or stronger property.

---

## 6. Owner decisions still required

1. **An approved dairy-fruit gelato role target.** Items 1 + 2 together remove the only
   source of a fruit dose for a dairy gelato (`fruit_gelato_ref_v1`, transcribed from a QA
   fixture). Until the science team authorises a `fruit` role target for `milk_base_v1` /
   G17 / G18 (or an approved fruit-gelato template for the native `milk_gelato` cell), PI
   **cannot formulate a dairy fruit gelato from zero** — it asks the user for the amount.
   Once an approved target exists, adding a `T('fruit', <grams>, null)` role to the milk
   templates restores from-zero formulation with no other code change.
2. **Regression pass on the five newly hard-safe-false cases** (T7, T8, T9, T15, T16). Their
   numbers did not change, but their residuals are now HARD, so those previews are
   diagnostic-only and cannot be applied. If the owner considers any of them legitimately
   applicable, the decision to make is whether the ACCEPTANCE ADDENDUM 3 hard-residual door
   should keep its current absolute form — that door is a frozen invariant and was NOT
   touched here.
3. **Nut and alcohol calibration.** `nut_gelato` and `alcohol_gelato` now score on
   `milk_gelato` science by explicit routing rather than by silent fallback. If the science
   team intends distinct nut/alcohol bands, seeding those cells in `targets.ts` will make
   them selectable automatically (the derivation reads the seeded-cell list).
4. **Chocolate without dairy.** A visible Gelato containing chocolate but no dairy and no
   fruit stays on `chocolate_gelato`, whose approved bands include the dairy gates, so it
   fails them visibly rather than being silently re-profiled to vegan. Documented in
   `productType.ts`; confirm this is the wanted behaviour or authorise a vegan-chocolate cell.

---

## 7. Files changed

**Runtime**
`src/features/studio/productType.ts` · `src/features/studio/buildRecipeInput.ts` ·
`src/features/formulation/templateRegistry.ts` · `src/features/formulation/formulate.ts` ·
`src/features/constraint-studio/applyPipeline.ts` ·
`src/features/constraint-studio/constraintStudioCopy.ts` ·
`src/features/constraint-studio/previewIssueMessage.ts` ·
`src/features/constraint-studio/ui/ConstraintPreviewCard.tsx` · `src/copy/en.ts` (one label) ·
`src/qa/engine-authenticity/authenticityCases.ts`

**Tests** (all with in-file supersession comments)
`canonicalWorkbench.test.tsx` · `buildRecipeInput.test.ts` · `liveRuntime.test.ts` ·
`zeroGramSemantics.test.ts` · `nightlyP0.test.ts` · `acceptanceAddendum.test.ts` ·
`constrainedReformulation.test.ts` · `formulation.test.ts` · `formulationAuthenticity.test.ts` ·
`currentDraftOptimization.test.ts` · `staleDraftState.test.ts` · `applyIntegrity.test.ts` ·
`recalcDuplication.test.ts` · `autoBalance.test.ts` · `constraintStudioUi.test.tsx` ·
`nonProductionSurfaces.test.tsx` · `proRecipeUxRepair.test.tsx` ·
`themeProDarkContrast.test.tsx` · `engineAuthenticity.test.ts`
**NEW:** `src/features/constraint-studio/canonicalHonesty.test.ts`

**Artifacts (regenerated from the real pipeline)**
`docs/engine-validation/ENGINE_AUTHENTICITY_TESTS.json` · `.csv`

**Not touched:** `src/engine/**` · `src/stores/recipeStore.ts` ·
`src/features/constraint-studio/constraintStudioStore.ts` · `src/features/pi-panel/**` ·
`src/features/pro-workbench/**`.
