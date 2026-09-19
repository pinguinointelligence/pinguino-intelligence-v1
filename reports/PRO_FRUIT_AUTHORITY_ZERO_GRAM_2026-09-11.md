# PRO Fruit BASE_RECIPE authority + zero-gram edit — forensic & fix (2026-09-11)

Branch `claude/pro-fruit-authority-zero-gram`, base `origin/staging` **c65e52ef** (PR #276 merge;
served bundle `index-BfbwGVaO.js` inlines that SHA). Owner brief: *OWNER FORENSIC FIRST — PRO FRUIT
BASE_RECIPE AUTHORITY + ZERO-GRAM EDIT REGRESSION*. PR #276 was not reopened.

## 1. Symptoms (owner)

- **A.** PRO Sorbet, STRAWBERRIES / CRANBERRY / WATERMELON at 0 g → Crown on all three → 1 g Main each
  → PRZELICZ: „Brak zatwierdzonego uprawnienia BASE_RECIPE dla: line-…", later a refusal listing ice
  share, NPAC, POD, water, total solids.
- **B.** Fruit 0 g → Crown → 1 g Main → Crown off → 0 g → `+` and `−` do nothing → „Podaj gramaturę…
  Minimalna ilość to 1 g."

## 2. Evidence

### Served staging (c65e52ef, `pro@pro.com`, fresh Sorbet starter S03)

| Step | Line state (persisted store) |
|---|---|
| add STRAWBERRIES / CRANBERRY / WATERMELON at 0 g | `RESOLVED` (STANDARD, BASE_RECIPE `eligible`); STRAWBERRIES `MAIN_CAPABLE` (policy `main-sorbet-exact-fruit-60-v1`), CRANBERRY / WATERMELON `MAIN_CAPABLE_UNCALIBRATED` |
| Crown ×3 (row trigger) | 1 g, `main`, `RESOLVED` after the managed pass (starter branch) |
| PRZELICZ | `constraint_verification_failed` / `unsafe_proposal`: „Parametry poza zakresem: Udział lodu, NPAC, słodycz (POD), Woda, Sucha masa" — every fruit `RESOLVED/MAIN` |
| STRAWBERRIES Crown OFF (row badge) | 0 g, `unlocked`, snapshot **MISSING**, `+` enabled, no row refusal |
| `+` | still 0 g |
| HOME Crown OFF on CRANBERRY (`home-crown-*`) | 0 g, snapshot kept `RESOLVED/MAIN` (HOME's `setLockType` never touches snapshots) |

The Browser pane also held a persisted ambiguity from an earlier session:
`LEGACY_BEHAVIOR:zapis working copy odrzucony (recipe_constraint_invalid)` — the managed pass refused
by the verified-write door on a real served draft.

### Local, through the real doors

- **Real row control over the real store** (jsdom): after Crown ON → pass → Crown OFF the snapshot is
  `MISSING`; the row gate at the current 0 g reads *ready* (stepper open); the click gate at the
  requested 1 g reads `Brak zatwierdzonego uprawnienia BASE_RECIPE dla: line-…` → `+` and typed 20 g
  both refused.
- **Real managed pass** (`useLegacyRecipeBehaviorRevalidation`, mocked server): fresh starter → three
  crowned lines `RESOLVED`; the same draft with the starter fields cleared (the state of every
  saved / reopened / re-saved draft) → the commit through `applyVerifiedRecipeInput` is refused
  (`recipe_constraint_invalid`) and all three stay `REVALIDATION_REQUIRED`, rows closed with the
  owner's exact message; Crown OFF → 0 g → the pass never visits the line.

### Offline replay of the served Przelicz input

The exact served lines and server snapshot authority, run through `runOptimizePreviewOffMainThread`
with the served options:

| Variant | Result |
|---|---|
| served (home Ninja 670 g cap), 3 Mains @ 1 g | `unsafe_proposal` [ice_fraction, npac, pod, water, total_solids] — **identical to served** |
| professional machine | same |
| all three calibrated | same |
| all three user-held | same |
| 2 Mains @ 1 g | same |
| 1 Main @ 1 g | preview, Main ≈ 3 g (sugar-water) |
| 3 Mains @ 200 g, on-batch | preview, Mains unchanged |
| **3 Mains @ 1 g, Direction inactive** | **preview 268 / 268 / 267 g fruit** |

Identical at **619ab45c** (pre-#276), **2774715a**, **1022df98**, **ddff5d29** (09-07 release).

## 3. Root causes

**Bug B — first broken transition: `recipeStore.setStandardIngredient`.** Crown OFF of the untouched
1 g seed returns the line to 0 g and deletes its ProductBehavior snapshot (3696d2bc, 2026-09-05;
before it, since 4b649796 / 9c8eaf15, the snapshot was left `REVALIDATION_REQUIRED` — the same dead
end). The workspace stays managed; a 0 g line is outside `productBehaviorRequiredLineIds`, so no pass
re-resolves it; every grams write that gives it mass (+, typed, %) makes it required and the
BASE_RECIPE gate refuses the missing snapshot. `IngredientBuilder.editRefusalFor` judged the current
0 g, so the stepper looked enabled while every press was rejected (owner Q4: **yes, mismatch**).

**Bug A (authority) — first broken transition: the managed pass's commit.** Crown ON marks the line
`REVALIDATION_REQUIRED` (role change, 9c8eaf15). `useLegacyRecipeBehaviorRevalidation` re-resolves it
but, in any non-starter draft, commits through `applyVerifiedRecipeInput` (a18404e8), the terminal
full-recipe door that since 964d4f0b also runs the whole OPTIMAL/ECO recipe authority — and refuses a
draft still being built (`recipe_constraint_invalid`; `invalid_line` for any 0 g line). The crowned
lines stay stale for ever.

**Bug A (technical modal) — separate, long-standing, not authority, not PR #276.** Under the
always-active neutral Direction, Sorbet's exact-Direction path keeps Mains byte-exact
(`buildSorbetDirectionCandidatePreview` moves only unlocked lines), so Crown seeds at 1 g are never
raised; with two or more Mains the formulation path then produces an unsafe candidate. **Owner
decision required** — see §6. Not changed here.

Same root cause: **B and A-authority YES** (a Crown role change leaves line authority the managed pass
cannot re-establish); **A-technical NO**. PR #276 involved: **NO**. Package 2A: **NO** (never pushed).
PR #268: **NO**.

## 4. Fix (smallest generic)

1. `src/stores/recipeStore.ts` — `setStandardIngredient`: a Crown transition that leaves the line
   without mass keeps its current snapshot (the rule `setMainIngredient` already applies to a zero-gram
   crown). A line that keeps positive mass is still marked for revalidation.
2. `src/features/product-intelligence/useLegacyRecipeBehaviorRevalidation.ts` — the managed PRO pass
   (a) also refreshes a 0 g Base line whose snapshot is stale, and (b) when the server answers for the
   **same product version and facts** the line already carries, writes only the authority map, like its
   existing historical identity-only branch, instead of pushing the unchanged draft through the
   verified-write door. The starter branch is unchanged; a refused product stays stale and blocked; a
   republished version still goes through the verified write.
3. `src/features/ingredient-builder/IngredientBuilder.tsx` — the row's refusal is judged at the amount
   the control would write, so a refused stepper is shown closed with its reason.

Not changed: Solver targets, Engine math, PR #276 search space, Mapper, DB/Supabase, the HOME Crown
contract, PRO `0 g → Crown → 1 g`, Main floor / ProductBehavior, fail-closed fallbacks.

## 5. Tests

- `src/features/ingredient-builder/proZeroGramCrownAuthority.test.tsx` (13) — real row control, real
  store: 0 g `+`, typed 20 g, Crown ON seed, Crown OFF then `+` / typed, Crown re-arm, identity
  stability, stale-authority control closed + reason, real blocker fails closed, three-fruit authority
  + Przelicz gates, one-of-three Crown OFF, HOME Crown OFF/ON, HOME Protein mass-neutral.
- `src/features/product-intelligence/crownAuthorityRevalidation.runtime.test.tsx` (6) — real managed
  pass: starter, reopened draft, on-batch reopened draft, Crown ON→OFF race, server refusal (fail
  closed), republished version (verified write still owns it).
- `src/features/ingredient-builder/crownAutoSeed.test.ts` — the re-arm case now expects the kept
  `RESOLVED` snapshot instead of the deleted one.
- **Non-vacuity:** 8 of the 19 new cases fail on c65e52ef and pass with the fix.

## 6. Owner decision (not implemented)

Crown-seeded Sorbet Mains under the neutral Direction: should Przelicz maximize the Crown seed (GEL-P0-001
/ GEL-P0-005, „Crown maximizes") before the exact-Direction path holds Mains byte-exact? Today, with
two or more fresh-fruit Mains at the 1 g seed, every Sorbet Przelicz ends in the §2 refusal; with one,
it returns a ≈ 3 g-fruit sugar-water vector. Reproduce with the §2 replay input (three 1 g Mains over
the S03 starter at −13 °C / 1000 g).

## 7. HOME

HOME's own Crown (`setLockType(…, 'home')`) never touches snapshots, so it cannot produce Bug B; the
managed pass is PRO-only. Separate HOME observation, **not changed**: HOME's add path crowns through
the shared `setMainIngredient(…, 'home')`, which marks a positive line `REVALIDATION_REQUIRED`, and HOME
mounts no revalidation pass — so a HOME grams edit of that line is refused until a HOME recalculation
refreshes authority (local store evidence).
