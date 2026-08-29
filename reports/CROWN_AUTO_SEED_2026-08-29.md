# Crown toggle at 0 g — auto-seed contract

Owner P0: adding an ingredient (0 g) and immediately clicking Crown left the
line unable to accept any grams value.

## Root cause

`setMainIngredient` marks the line's ProductBehavior snapshot
`REVALIDATION_REQUIRED` on every Standard ↔ Crown transition — correct, the role
context changed. Both revalidation passes that clear that state
(`useLegacyRecipeBehaviorRevalidation` on the Pro workspace and
`useMonitorRecipeBehaviorRefresh`) only visit **required** lines, and
`productBehaviorRequiredLineIds` excludes lines at 0 g.

So a crowned 0 g line was marked stale and then never revisited. Every later
grams write — `recipeStore.setPlannedGrams`, its wrapper in `IngredientBuilder`
and `setPlannedGramsVector` — refuses a line whose BASE_RECIPE gate is not
ready, so the line was permanently unable to take an amount.

At 170 g the same transition happens, but the line is already a required line,
the existing pass revalidates it and editing recovers. That is why the defect
looked Crown-specific when it was really 0-g-specific.

## Contract

`src/features/ingredient-builder/crownAutoSeed.ts` — pure, no I/O:

```
grams == 0, Crown ON  -> seed exactly 1 g, remember WE seeded it
grams  > 0, Crown ON  -> preserve the amount exactly, remember nothing
Crown OFF             -> restore 0 g only while the seeded gram is untouched
                         otherwise preserve exactly what is there
```

One transient provenance set, `recipeStore.crownAutoSeededLineIds`. No gram
stack, no history. Restoring 0 g requires BOTH the flag and the amount still
being exactly the seed, so a deliberately typed 1 g survives the crown coming
off. Any explicit grams write (`setPlannedGrams`, `setPlannedGramsVector`)
clears the line from the set; removing the line clears it too.

Seeding makes the crowned line a required line, so the existing revalidation
pass reaches the role transition exactly as it already does for every other
line — that is what removes the permanent block.

The same rule is applied to the lower-level `setLockType` role write, so the
contract belongs to the role transition rather than to one button. Re-asserting
a crown the line already wears changes nothing and keeps the provenance.

An auto-seeded gram never writes `user_intent_anchor_grams`: it is the crown's
gram, not a user intent, and it is dropped again when the crown comes off.

## Never business data

`crownAutoSeededLineIds` is store state, not a `RecipeItem` field, so it cannot
reach the Engine, a saved `recipe_input`, or a production payload.
`recipePersistPartialize` is an explicit allow-list and omits it;
`loadRecipeInput` and `loadPreset` reset it to `[]`. A reopened recipe therefore
holds a real 1 g that the crown no longer owns.

## Files changed

```
src/features/ingredient-builder/crownAutoSeed.ts        (new, pure contract)
src/features/ingredient-builder/crownAutoSeed.test.ts   (new, 19 tests)
src/stores/recipeStore.ts                               (state + 5 mutation seams)
```

No Engine change, no ProductBehavior change, no Mapper change, no solver
workaround, no 2 g threshold, no grams control disabled.

## Focused test results

```
npx vitest run src/features/ingredient-builder/crownAutoSeed.test.ts     19 PASS
npx vitest run src/stores src/features/ingredient-builder \
               src/features/formulation                    73 files / 850 PASS
npx vitest run <main/crown/apply/zero-gram suites>          6 files / 152 PASS
npx vitest run src/features/product-intelligence src/features/recipe-composition \
               src/features/pro-workbench src/features/pro-core
                                              97 PASS, 19 skipped, 2 load failures
npm run typecheck   PASS
npm run lint        0 errors (4 pre-existing react-refresh warnings)
npm run build       PASS
git diff --check    clean
```

The 2 load failures (`proProfilePreflightUx`, `proRecipeStateRegression`) are
Vite `Denied ID` errors for a `@fontsource` asset reached through this
worktree's `node_modules` symlink. Reproduced identically with the change
stashed — a worktree setup artifact, not a regression.
