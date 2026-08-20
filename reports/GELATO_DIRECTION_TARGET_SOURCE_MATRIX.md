# Gelato Direction Target source matrix

Audit base: `a6ab880df49a4f17636c64d3964584df39330dea`

Scope: Gelato Direction Targets only. Direction preferences remain subordinate
to native Engine safety, ProductBehavior, Main/Multi-Main, dosage, stabilizer,
lock and batch authority.

| Pipeline step | Before this change | Canonical representation after this change | Source / evidence |
| --- | --- | --- | --- |
| Recipe control | Five visible detents, but `-2/-1` and `+1/+2` were collapsed by sign | Exact `-2/-1/0/+1/+2` | `ProfileDirectionAxes.tsx`; `proProfilePreflightUx.test.tsx` |
| Account defaults | Five visible detents plus sign-only `directionTargets` | Exact five-step value in both the canonical target and compatibility mirror | `AccountRecipeDefaults.tsx`; `proProfilePreflightUx.test.tsx` |
| Recipe store | Three-step Engine target plus separate five-step UI mirror | Exact `RecipeDirectionTarget` on `recipe.direction_targets`; mirror is identical | `recipeStore.ts`; `recipeProfileStore.ts` |
| Save / reopen | Sign target and optional richer UI intent could disagree | Exact five-step target is saved, normalized and reopened; legacy richer intent wins once during migration | `recipeProfilePersistence.ts`; `proProfilePreflightUx.test.tsx` |
| Monitor | Read the UI mirror; an old three-step position helper remained | Reads the synchronized exact target and positions all five detents at `0/25/50/75/100` | `MonitorLiveSummary.tsx`; `recipeAxisModel.ts` |
| RecipeInput / fingerprint | `RecipeDirectionTarget` allowed only `-1/0/+1` | Exact five-step values are serialized and fingerprinted | `engine/types.ts`; `applyPipeline.ts`; `gelatoDirectionTargetMatrix.test.ts` |
| Target band | Lower / middle / upper third | Five ordered preference zones inside the existing approved POD/NPAC band; no native band is widened | `recipeDirectionTargets.ts`; `recipeDirectionTargets.test.ts` |
| Score | Read the sign-collapsed band | Recomputed from exact grams, temperature, profile and exact five-step band | `recipeDirectionAssessment.ts`; `gelatoDirectionTargetMatrix.test.ts` |
| Solver objective | Direction existed, but adjacent strong/weak detents were indistinguishable; ECO could prefer cost before an unmet Direction objective | Exact five-step Direction violations use lexicographic missed-axis count then severity; ECO defers cost until active Direction is reached | `applyPipeline.ts`; matrix and ECO tests |
| No-op gate | A sign-equivalent state could be called clean; executable rounding could erase an apparent improvement | `already_clean` only when the exact Direction band is reached; otherwise solver runs and either returns an improving Preview or a proven Direction fixed point | `applyPipeline.ts`; `gelatoDirectionTargetMatrix.test.ts` |
| Preview | Exact solver candidate could be practicalized into a worse whole-gram Direction result | The executable whole-gram Preview is re-ranked against the same exact target before it can be shown | `applyPipeline.ts`; matrix tests |
| Apply | Fingerprint included only the three-step target | Exact target participates in stale/consent fingerprints; Apply revalidates the executable candidate | `applyPipeline.ts`; matrix tests |
| Customer fixed-point copy | Generic no-proposal text could imply that no change was needed | Explicit nearest-achievable Direction message names remaining Direction metrics and hard-constraint priority | `customerConstraintStudioPresentation.ts`; presentation tests |

## Exact semantic order

- Sweetness `-2 -> -1 -> 0 -> +1 -> +2`: ordered from the lowest to the
  highest approved POD preference zone.
- Visible Hardness `-2 -> -1 -> 0 -> +1 -> +2`: ordered from softer to firmer;
  therefore its approved NPAC target centers decrease monotonically.
- A target does not change Engine formulas or any native safety band.
- Sorbet, Vegan, Protein and Chocolate calibration is not expanded here;
  non-standard-Gelato profiles retain their accepted prior target-band mapping.
- A result that cannot improve legally remains unchanged and is reported as
  nearest-achievable, never as a generic exact-target success.
