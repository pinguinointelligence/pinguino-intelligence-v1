# PI Recipe Monitor — REUSE MAP

Agent B, branch `feat/pi-monitor`. This file records exactly which locked/engine/
spine/optimization modules the PI Monitor delegates to, so a reviewer can confirm
we did **not** re-implement the solver, re-hardcode the golden bands, or invent
composition. Nothing under `src/engine/**` or `src/spine/**` is modified.

## The golden bands (READ ONLY — never re-hardcoded)

| Need | Reused via | Notes |
| --- | --- | --- |
| The golden range per (product, serving °C) | `selectTargetBand(category, temperatureC)` from the **`@/engine` barrel** | Returns `{ band, temperature_fallback, category_fallback }`. The band's `metrics[TargetMetric]` gives `{min,max}` verbatim from the locked `TARGET_BANDS`. We never import `src/engine/config/targets.ts`, never copy a number. Same channel the sibling `features/optimization/temperatureAwareTargetBands.ts` uses. |
| Direction semantics (which way is "too sweet" / "too hard") | Grounded in the engine's own `DIRECTIONAL_STATUS` table (`src/engine/statuses.ts`) | `pod` below=`too_weak`/above=`too_sweet`; `ice_fraction` below=`too_soft`/above=`too_hard`; `fat`; `total_solids`. Our four customer axes map 1:1 onto these engine metrics — we do not invent a new direction rule. |

### Customer axis → engine metric mapping

| Customer axis (PL) | Engine `TargetMetric` (band) | `BaseEngineMetrics` field (value) |
| --- | --- | --- |
| `slodycz` — Słodycz | `pod` | `pod` |
| `miekkosc_twardosc` — Miękkość–twardość | `ice_fraction` | `iceFraction` |
| `kremowosc_tluszcz` — Kremowość–tłuszcz | `fat` | `fat` (absent for sorbet → axis reported not-applicable, never faked) |
| `pelnia_body` — Pełnia–body | `total_solids` | `solids` |

## The recalculation pipeline (NO new solver)

`Przelicz z PI` delegates the whole recalculation to the existing sanctioned
runner — we inject it, we never call the engine/solver directly from the pure core.

```
PiMonitor (pure) --intent--> [injected PiRecalculationRunner]
    -> features/optimization/optimizationPreviewRunner.previewOptimization(recipe, intent)
        -> @/engine calculateRecipe            (real Base Engine)
        -> @/spine routeRecipeIntegrationFlow  (Integration Flow IF1-IF8)
        -> @/spine routeOptimizationFlow       (Optimizer routing: optimized/tradeoff/impossible/blocked)
        -> @/spine runOptimizationRerunPreview + realRerunCorrection
              (real correction solver proposeAutoFix/applyAutoFix + real calculateRecipe rerun)
        -> @/spine verifyOptimizationRerun     (before/after re-evaluated through the Temperature Regulator)
```

- The **decision** (`optimized` / `tradeoff` / `impossible` / `blocked` /
  `no_action_needed`) and the **regression info** (`rerun.newFailures`,
  `rerun.worsenedFailures`) come straight from `verifyOptimizationRerun` inside
  `optimizationFlowRouter.ts`. We never re-derive "did it improve".
- `previewOptimization` already wires the **real correction solver**
  (`proposeAutoFix` -> `applyAutoFix` -> `calculateRecipe` rerun) and the IF9/IF10
  multi-lever machinery lives one level down in the same feature
  (`branchRecalculationPreview.ts` -> `batchRescueMultiLeverSolver.ts`). PI Monitor
  is a **recipe-design** context, so it routes through `routeRecipeIntegrationFlow`
  (the default recipe branch of `integrationFlowDispatch.ts`), which is the correct
  branch for customer recipe tuning; batch-rescue/stock contexts need actual-batch/
  stock payloads a customer recipe does not have.

## Customer intent -> the pipeline's intent (genuine, not theatre)

The customer's **stepped** choice per axis (`decrease | keep | increase`, rendered
as axis-specific Polish) is mapped onto `NormalizedRecipeIntent`:

| Axis | Intent lever it nudges | Reused from |
| --- | --- | --- |
| `slodycz` | `sweetnessPreference` (`low`/`balanced`/`high`) | `@/spine` `NormalizedRecipeIntent`; consumed by `designRecipe` -> `optimizerConstraints.sweetnessPreference` / `SWEETNESS_TARGETS` |
| `miekkosc_twardosc` | `texturePreference` (`soft`/`medium`/`firm`) | `designRecipe` -> `optimizerConstraints.texturePreference` / `TEXTURE_TARGETS` |
| `kremowosc_tluszcz` | *(no dedicated spine preference lever)* | Recorded as an **advisory wish**; recalc still targets the golden `fat` band. Reported honestly, never faked. |
| `pelnia_body` | *(no dedicated spine preference lever)* | Advisory wish; recalc still targets the golden `total_solids` band. |

The wish enters the intent that the pipeline genuinely consumes. The **truth**
shown to the customer (Przed/Po, optimized vs tradeoff) always comes from the real
`beforeMetrics` / `afterMetrics` the runner returns — never from the wish.

## Persona gating (canonical capability, never isPro/email)

`features/pro-core/proCoreCapabilities.proCoreCapabilitiesFor(persona).canViewExactGrams`
is the single gate.

- **Demo** (`canViewExactGrams === false`): QUALITATIVE only. Axis readings carry
  **no** `value`/`band`/gram numbers — redaction happens **in the data** (the
  numbers never enter the payload), mirroring `features/customer-flow/recipeView.ts`.
- **Home / Pro** (`canViewExactGrams === true`): exact numeric axis values, bands,
  and the solver's proposed gram adjustments.

## Ingredient-resolution gate (injected, not imported)

The exact recalculation is blocked while any ingredient is an unresolved generic
requirement. PI Monitor consumes a **minimal injected interface** and never imports
the sibling Ingredient-Resolution module:

```ts
interface IngredientResolutionSummary {
  allResolved: boolean;
  unresolvedCount: number;
  unresolvedNames: string[];
}
```

When `!allResolved`, `Przelicz z PI` is blocked with the exact Polish copy
(honest count + plural): `Najpierw wybierz konkretny produkt dla {n} skladnika/skladnikow,
aby PI moglo dokladnie przeliczyc recepture.` (rendered with Polish diacritics).

## Apply / Undo / Readjust — LOCAL only

`Zastosuj zmiany` swaps the local draft to the hypothetical corrected snapshot the
runner returned; `Cofnij` restores the previous local draft; `Dostosuj ponownie`
re-opens the stepped choices. Nothing is saved, persisted, or written — no new
migration is required (none added).

## Files that were READ to build this (delegated to, not duplicated)

- `src/engine/config/targets.ts` (TARGET_BANDS — read only, via `selectTargetBand`)
- `src/engine/statuses.ts` (`selectTargetBand`, `DIRECTIONAL_STATUS` semantics)
- `src/features/optimization/optimizationPreviewRunner.ts` (`previewOptimization`, `studioIntentFromRecipe`)
- `src/features/optimization/temperatureAwareTargetBands.ts` / `temperatureAwareCorrectionTargets.ts`
- `src/features/optimization/branchRecalculationPreview.ts` / `batchRescueMultiLeverSolver.ts` / `verifiedSubstituteContract.ts` / `acceptedCorrectionDraft.ts` / `solverTargetInjection.ts`
- `src/spine/optimizationFlowRouter.ts` (`routeOptimizationFlow`, `verifyOptimizationRerun`)
- `src/spine/integrationFlowDispatch.ts` (recipe-design dispatch branch)
- `src/features/customer-flow/recipeView.ts` (Demo redaction-at-source pattern)
- `src/features/pro-core/proCoreCapabilities.ts` (canonical grams gate)
- `src/features/studioBoundary.test.ts` / `src/features/auth/authSecurity.test.ts` (guard tests we must not trip)
