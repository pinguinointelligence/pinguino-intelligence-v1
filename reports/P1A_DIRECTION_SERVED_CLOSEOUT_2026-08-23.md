# P1-A DIRECTION — SERVED CLOSE-OUT + P2 STATE FIX

**Date** 2026-08-23 · **Staging SHA** `40b3755` · **Deployment** `dpl_8PJY1u7KSGmoD6uAZKDkcxRZWN6S` (READY)
**Served bundle** `index-DmG92Uka.js` · **Host** https://staging.pinguinoai.com
**Production untouched.** Solver, Direction bands, `targetFifth` and `MAX_SOLVER_ROUNDS = 18` were not modified.

---

## 1. P2 — the diagnosis changed under measurement

The working theory was that **“+ Nowa receptura”** leaked the previous recipe’s Direction. That was tested on the
deployed pre-fix bundle first, and it is **false**: recipe A at Sweetness −2 → new recipe B started at 0/0.

The route that actually leaks is the **starter rebuild**:

> gelato draft at Sweetness −2 / Hardness +2 → change _Typ produktu_ to Sorbet → confirm “Przebuduj” →
> an all-new sorbet (new category, new temperature, **every ingredient replaced**) still carrying **−2/+2**,
> on an **unchanged** `draftContextSeq` (19 → 19).

`rebuildNewRecipeStarter` replaced the whole recipe but never reset `direction_targets` and never opened a new
draft context, so the Direction regulator stayed bound to the recipe that had just been discarded.

### Fix

- A rebuilt starter resolves Direction exactly like `startNewRecipe`: the account default deliberately configured
  for the **new** product, otherwise the clean middle. It advances `draftContextSeq` and rebinds the regulator
  through `openDraft`. Neutral remains an **ACTIVE** contract (P1-A preserved).
- `loadRecipeInput` consulted `profile?.directionTargets` **before** the recipe’s own `goals.direction_targets`,
  so a recipe saved at −1/+2 reopened wearing whatever was last configured. The saved recipe now outranks the
  ambient per-profile snapshot.

### Deliberately NOT changed — needs an owner decision

`startNewRecipe` / `resetToDemo` seed Direction from the **per-product account default**. Measured on the same
bundle, that path does **not** carry the previous recipe’s state: the default is written only by the _Account
Recipe Defaults_ screen, and two accepted owner fixtures encode it (`startNewProRecipe.test.ts`,
`proProfilePreflightUx.test.tsx`). A deliberately configured default is not a leak.
**Open question:** should a fresh recipe also ignore a deliberately configured account-default Direction?

### Regressions

`src/stores/recipeStore.directionReset.test.ts` — 12 tests. **6 fail without the fix** (5 rebuild cases + the
saved-recipe precedence case), all 12 pass with it. Verified by bisect (`git checkout src/stores/recipeStore.ts`).

### Served verification (on the fix bundle)

The identical sequence now yields **0/0** on `draftContextSeq` 3, with `openedContextSeq` rebound to 3.

---

## 2. Served method — what every cell had to prove

Fresh recipe per cell, then in order:
profile/temperature/mode confirmed **against the store** → “Potwierdź ustawienia” → **canonical baseline
fingerprint** captured from the persisted store → Direction set and **verified present in the store** (never read
from the DOM) → baseline re-checked as unmoved → _Przelicz_ → **Preview `before` vector must equal the baseline
exactly** → _Zastosuj zmiany_ → executable state must equal the preview’s `after` → user-facing **Monitor** read
and required to agree.

Two harness defects were found and corrected mid-run; **all affected results were discarded and re-measured**:

1. A hidden browser pane clamps `setTimeout` to 1000 ms. Replacing fixed sleeps with worker timers exposed races,
   so every wait became a **condition on real store state**. All 19 rows collected during the racy window were
   thrown away — including the ones that “passed”.
2. The preview parser required `→ N g` and therefore silently dropped a removed line rendered as `→ — USUNIĘTY`
   (−12 ECO S+2, INULIN). That surfaced as `preview_before_drift`; it was a parser gap, not a product defect —
   the app labels removals correctly.

---

## 3. Sweetness — 5 levels × 3 temperatures × 2 modes = 30/30 PASS

Delivered POD per cell:

| block       | −2    | −1    | 0     | +1    | +2    |
| ----------- | ----- | ----- | ----- | ----- | ----- |
| −11 OPTIMAL | 12.84 | 13.56 | 14.98 | 15.96 | 16.73 |
| −11 ECO     | 12.79 | 14.00 | 14.67 | 15.92 | 16.99 |
| −12 OPTIMAL | 12.99 | 13.98 | 14.94 | 15.56 | 16.09 |
| −12 ECO     | 12.96 | 13.98 | 14.94 | 15.38 | 16.16 |
| −13 OPTIMAL | 12.91 | 13.96 | 14.97 | 15.94 | 16.37 |
| −13 ECO     | 12.98 | 13.97 | 14.91 | 15.94 | 16.11 |

Five **distinct, strictly monotonic** levels in every block. The −2/−1/0 collapse that opened this investigation
is gone at every temperature and in both modes.

Across all 30 cells: Score **10/10**, verdict `PI osiągnęło wybrany profil.`, `Parametry poza zakresem 0 → 0`,
Preview `before` == verified baseline, executable == preview `after`, Apply accepted, Direction held through Apply,
and the Monitor label matched the requested level (`zdecydowanie mniej` … `zdecydowanie bardziej`).

## 4. Hardness — 5 levels at −12 OPTIMAL, Sweetness 0 = 5/5 PASS

| −2         | −1    | 0     | +1    | +2    |
| ---------- | ----- | ----- | ----- | ----- |
| NPAC 48.38 | 47.47 | 45.32 | 44.19 | 42.24 |

Five distinct, strictly monotonic levels (lower NPAC = harder), all Score 10, POD held mid-band (14.5–14.95).

## 5. Combined extremes at −12 OPTIMAL = 4/4 PASS

| S/H     | POD   | NPAC  | Score |
| ------- | ----- | ----- | ----- |
| −2 / −2 | 12.94 | 48.39 | 10    |
| +2 / +2 | 16.07 | 43.39 | 10    |
| −2 / +2 | 12.92 | 42.19 | 10    |
| +2 / −2 | 16.84 | 49.28 | 10    |

Both axes move independently and in the correct direction in all four corners.

## 6. Persistence loops — 3/3, zero drift

Preview → Apply → Recalculate → Save → **full localStorage wipe + hard reload** → reopen from _Moje receptury_ →
Recalculate.

| case | saved      | reopened POD/NPAC | Direction   | recipe    | metrics  |
| ---- | ---------- | ----------------- | ----------- | --------- | -------- |
| S−2  | `3705f834` | 12.99 / 45.42     | −2 restored | identical | no drift |
| S0   | `f54ee46b` | 14.94 / 45.32     | 0 restored  | identical | no drift |
| S+2  | `a783db65` | 16.09 / 46.13     | +2 restored | identical | no drift |

After Apply the app offers **no** recalculation — the draft is already at its verified executable state, so there
is nothing left to drift. This half of the loop is what the `loadRecipeInput` precedence fix protects.

**Data created in the owner’s staging library** (delete when no longer needed):
`QA P1A Direction S-2 (2026-08-23)`, `QA P1A Direction S+0 (2026-08-23)`, `QA P1A Direction S+2 (2026-08-23)`.

## 7. Multi-Main — partial, with one new served finding

**Proven on gelato −12** (STRAWBERRIES 200 g + BANANA 100 g, both Main, 1000 g):

- both lines recognised and badged `Składnik główny · ustawienie receptury`;
- the **2:1 ratio is preserved exactly** through _Przelicz_ (2.0 in → 2.0 out) — the Mains are never mutated;
- Apply is **refused truthfully** rather than faking success:
  `PI nie utworzyło bezpiecznej receptury… Parametry poza zakresem: NPAC, słodycz (POD), białko w suchej masie…`
  followed by `Receptura nie została zmieniona.`

**Not obtained:** a _positive_ Multi-Main Direction Apply. The hand-built dairy+fruit fixture is genuinely
infeasible — 180–300 g of fresh fruit displaces enough milk solids to fail protein-in-dry-matter while fruit
sugars hold POD high. Retuning to 120/60 improved it (Score 7 → 8, four failing gates → two) but did not clear it,
and neutral Direction failed the same two gates. **This is a fixture limitation, not a proven product defect.**

### NEW FINDING (owner triage) — a second Main cannot be set on a sorbet, and no reason is given

On a fresh **sorbet −12 OPTIMAL** with STRAWBERRIES set as Main, **BANANA’s “Ustaw jako składnik główny” is
disabled**, and it stays disabled across the whole gram range — probed at strawberries 400 → 380 → 340 → 300 →
260 → 220 → 180 → 140 → **100 g** with banana at 200 g. So it is not envelope saturation. The control exposes no
reason: the tooltip is the generic `Definiuje smak i tożsamość produktu.` and there is no `aria-describedby`.
The same two fruits **could both be Main on gelato**. Either sorbet deliberately permits a single Main — in which
case the UI must say so, per the “say why a line cannot be Main” principle already applied to Protein — or the
gate is wrong.

---

## 8. Local gate on `40b3755`

`vitest` **7666 passed / 0 failed** · `tsc -b` clean · `eslint` 0 errors (4 pre-existing warnings) ·
`vite build` OK · `products:audit`, `mapper:runtime-audit`, `catalog:mapper-only:validate`, `process:validate` OK ·
`production-rescue:bundle-check` verified `f88585fc…dca7` (unchanged) · `git diff --check` clean.

**Test-budget change:** three Direction-heavy Main-envelope tests in `mainTechnicalMaximum.test.ts` exceed the
repo’s deliberate 5 s per-test contract at 18 solver rounds (worst measured **8.7 s**) and were flaking — they
also failed on the committed baseline. They now carry an explicit 20 s timeout. **Every assertion is unchanged**,
and the global 5 s contract still applies to all other tests.

## 9. Status

- **P1-A — closed on served evidence.** 39/39 Direction cells pass the full clean-state protocol.
- **P2 — fixed and proven served**, with regressions that fail without the fix.
- **Open:** the account-default question in §1; the sorbet second-Main finding in §7; a positive Multi-Main
  Direction Apply still needs a designed feasible fixture.

Ledger: `reports/qa/p1a-served/DIRECTION_SERVED_MATRIX_2026-08-23.csv`
