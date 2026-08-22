# Global zero-gram executable recipe invariant (2026-08-22)

Branch: `claude/zero-gram-invariant` (fresh worktree from `origin/staging` a06fbb3)
Scope guard: Sorbet physics untouched (`src/engine/sorbetFreezingPhysics.ts` not modified), Mapper untouched
(`docs/ingredients/validation/mapper_basement.csv` fingerprint `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`), no production deploy.

## Owner authority

A recipe ingredient with 0 g is allowed ONLY as a temporary editor placeholder right after the user manually adds an
ingredient and has not entered an amount yet (there "Przelicz" may truthfully ask for ≥ 1 g or removal). Canonical
Engine-generated / executable states — Recalculate, Direction, Rescue, Auto-balance, Preview, Apply, Save,
reopen/version, Production executable recipe — must NEVER contain a 0 g ingredient row. "Not used" = the row is
OMITTED. Absence allowed ≠ explicit 0 g row allowed.

## Root cause

1. The whole-gram projection `practicalizeRecipeCandidate` (the executable recipe every Preview kind, the Apply door
   recheck, the Save gate, the production lifecycle and the Rescue practicalizer use) was strictly index-preserving:
   an exact 0 g optional line (or < 0.5 g rounding to 0) stayed an explicit `0 g` row.
2. Engine search legitimately resolves optional lines to exactly 0 g: the draft candidate ladder's explicit "to zero"
   move for unanchored lines (`draftCandidateVector.ts`), used by the priced ECO cost sweep (`ecoDraftCostSweep.ts`)
   and the local corrector; the Sorbet exact-Direction projection / Main frontier (dextrose → 0); residual
   reconciliation can decrement a 1 g editable line to 0. The served regression: a priced Sorbet ECO sweep produced
   `INULIN = 0 g` (and Direction solves `DEXTROSE = 0 g`), Apply wrote the 0 g row into the draft, and the next
   Przelicz stalled on `PRODUCT_GRAMS_REQUIRED` ("Podaj gramaturę… minimalna ilość to 1 g") for a row the user never
   typed.
3. The Apply door's ingredient-identity gate refused any proposal that lacked a current line (only the explicit
   standard-removal consent could drop a line), so omission could not even be proposed.

## Shared normalization boundary (the fix)

`src/features/practical-recipe/practicalRecipe.ts`
- New exported predicate `isOmittableUnusedLine(input, set, item)` = line protection `editable` (unlocked Standard line,
  no physical mass, no gram/percent/range lock, not Main/required, not a template-controlled stabilizer, not an
  unavailability tombstone) and `unusedZeroGramLineIds(input, set)`.
- `practicalizeRecipeCandidate` now OMITS, after every existing whole-gram verdict (locks, Main identity,
  stabilizer contracts, hard gates, batch total — all computed with those rows weighing 0 g), the optional lines that
  weigh exactly 0 g in the executable recipe. `audit.lines` still documents each omitted line (exact → 0 g,
  protection `editable`) and line traces are keyed by line id (no index coupling). Protected lines are never
  auto-omitted: a 0 g locked/required/Main row is a contract (an unfinished placeholder the PI guard refuses before
  any candidate exists).
  This single function is reached by: every `finishPreview` (optimize, formulation, exact Direction, batch
  reconciliation/auto-balance, suggested fix, substitution, removal), the Apply door recheck, the Pro Save gate
  (`useCanonicalRecipeSave`: audit match + executable == as written), the store acknowledgement after a clean recalc,
  `productionRescue.practicalizeProductionRescueCandidate`, and the production lifecycle audit.

`src/features/constraint-studio/applyPipeline.ts` (Apply door)
- `ingredientIdentityIntegrityViolations` accepts a missing CURRENT line only when it is an omittable unused line
  (`isOmittableUnusedLine(current, currentConstraints, line)`) on a Preview with a ready whole-gram projection; the
  existing anchored-presence gate still refuses any positively anchored line, the practicalization recheck still
  rebuilds the same executable vector from the exact candidate, and protected lines keep the full identity contract.
  Trust-wise this equals the 0 g proposal the door always accepted for exactly these lines.
- The APPLIED product-behavior authority set drops the omitted lines' snapshots (Base lines of the proposal +
  post-process toppings) — every verification still runs on the complete verified set; the atomic store write
  therefore binds snapshots only to lines that exist.

`src/stores/recipeStore.ts` (reopen/version)
- `loadRecipeInput` of a SAVED version (link with saved id/name) drops legacy explicit 0 g optional rows
  (`unusedZeroGramLineIds` with an empty session constraint set), prunes their composition snapshots and marks the
  recipe "Oczekuje na przeliczenie". Unsaved drafts keep every 0 g row — there it is the editor placeholder.

`src/features/production-workspace/productionReadinessState.ts`
- `productionRecipeLifecycleState` → `TECHNICALLY_STALE` while the working input carries an explicit 0 g optional
  row (never production-ready until recalculated).

Production Rescue Edge bundle regenerated (it bundles `practicalRecipe.ts`): `0fd4f0c7f255a5f37e0d74d732f33b1f92eda50f1b7e3fb317361c6e6f97e480`.

## Temporary editor placeholder behaviour (unchanged)

- `addIngredient(ingredient, 0)` keeps a 0 g unlocked row in the draft.
- Runtime "Przelicz" (`createOptimizePreviewWithServerAuthority` → `missingProductDosePreviewIssue`) answers
  `PRODUCT_GRAMS_REQUIRED` / "Podaj gramaturę… Minimalna ilość to 1 g" and leaves the draft untouched.
- A placeholder can never be saved: the Save gate's whole-gram projection omits it, so "executable == as written"
  fails until the user enters ≥ 1 g or removes the row.

## Tests (`src/features/constraint-studio/zeroGramExecutableInvariant.test.ts`, 14 cases covering the 17 items)

1 placeholder valid · 2 Przelicz asks ≥ 1 g/removal · 3 Engine candidate 0 g → omitted (protected rows kept) ·
4/5/9 ECO regression −12/−13: priced sweep → inulin omitted in Preview (diff `removed`) and Apply, snapshot and
constraint gone, next Przelicz no longer `PRODUCT_GRAMS_REQUIRED`, Monitor GOOD · 6 Save gate: verified draft saves
byte-exact, 0 g row blocks Save · 7 reopen: legacy saved version drops the 0 g row (awaiting recalculation), unsaved
draft keeps its placeholder · 8 Production: session lines all > 0, lifecycle refuses a 0 g working input ·
10 OPTIMAL: Sorbet 2:1 (clean → already_clean, no 0 g) + over-sweet Gelato starter Preview applied without 0 g ·
11 Direction: −11 lime 300 + strawberries 300 (formerly dextrose 0 / inulin 0) → omitted, Mains 300/300; −12
softness −1 held-Main Direction still applies · 12 Rescue: every rescue candidate positive, a zeroed unadded line is
omitted · 13/14 Sorbet/Gelato: Main lines never omittable, applies positive · 15 Vegan formulation · 16 Protein ·
17 topping semantics unchanged (toppings outside the BASE projection, 0 g topping placeholder untouched by Apply).

Existing pins adapted to the invariant (each asserted an explicit 0 g row; now absence): `engineAuthenticity` T20
(saved reload has no 0 g rows, signatures compared by ingredient id), `currentDraftOptimization` 8/A/F (zero Inulin
omitted, all proposed rows > 0), `formulation` "optional zero Inulin remains absent" (line undefined),
`stabilizerContractRegression` strong-Direction Inulin 0 g → row omitted (and every proposed row > 0), vegan
formulation snapshots (only `grams: 0` rows removed), `directionAcceptanceMatrix` (chocolate gelato Main frontier
omits the emptied cream/cocoa donors — accepted by the door), Production Rescue Edge bundle test (bundle regenerated).

## Gates

| Command | Result |
|---|---|
| focused constraint-studio / practical-recipe / production-workspace / formulation / recipe-direction / recipe-constraints / pro-core / stores / recipes / pro-workbench | 114 files PASS after the fix (only the regenerated bundle + acceptance matrix needed the door rule) |
| `npx vitest run` (full) | see ledger below |
| `npm run typecheck` / `npm run build` | PASS (existing chunk-size advisory) |
| `npx eslint` (changed files) / prettier | PASS |
| `npm run products:audit` / `process:validate` / `catalog:mapper-only:validate` | PASS (Mapper SHA `b13f5db4…`, 2088 rows, 0 alignment differences) |
| `npm run production-rescue:bundle-check` | PASS, bundle `0fd4f0c7…` |
| `git diff --check` | PASS |

## Ledger

- Full `npx vitest run` (final tree, after bundle regeneration): 555 files passed, 6949 tests passed, 0 failed (run #2 before the bundle refresh: 6948/6949, only the stale bundle-manifest hash; run #1 before pin adaptation drove the test changes above).
- Final staging SHA: __STAGING_SHA__ · Vercel `pinguino-staging` deployment: __DEPLOYMENT__ · served bundle: __BUNDLE__
- Served smoke (TEST PRO): __SERVED__
- Production: `main` 4dfb097 untouched (www.pinguinoai.com still serves `assets/index-BTR3SdkC.js`).
- Mapper Base unchanged.
