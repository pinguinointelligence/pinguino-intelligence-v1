# INTERACTIVE RECALCULATION PREVIEW + CONFLICT RESOLUTION — HOME + PRO

Owner task 2026-09-11. Branch `claude/interactive-recalc-preview`, isolated worktree
`~/Developer/pinguino-interactive-recalc`, base `origin/staging` **`c65e52ef`** (PR #276 merge).
Built on top of the owner-accepted PR #276 Main search; none of its semantics were changed.

## 1. What the customer gets

**Part A — interactive preview.** Every proposed amount in „Sprawdź proponowaną korektę” is
the recipe row's own grams control + padlock (`DirectNumberControl`). The original value stays
on the left. Changing an amount or a padlock turns **„Zastosuj zmiany” → „Przelicz”**; setting
it back to the proposal withdraws the edit. „Przelicz” re-solves inside the SAME modal. An
edited amount without the padlock stays a Solver input (the row's typed-amount semantics); only
the padlock makes it exact. Nothing reaches the recipe before „Zastosuj zmiany”; X / Wróć
discards everything provisional.

**Part B — conflict resolution.** When the customer's OWN locks make the recipe infeasible, the
modal no longer ends in a technical sentence. It shows (PRO):

> NIE DA SIĘ ZACHOWAĆ WSZYSTKICH BLOKAD W OBECNYCH ILOŚCIACH.
> Przy obecnych ustawieniach płynna baza ma 22,7%, a wymagane minimum to 30%.
> Gellatti proponuje najmniejszą korektę, która pozwala zachować prawidłowy profil.
> `Płynna baza: 22,7% · Minimum technologiczne: 30%`

then the customer's locks — the ones that genuinely have to move first, each prefilled with
the smallest Solver-proven amount in the same grams control, the others marked „Bez zmian”.
**„Użyj propozycji”** recalculates with exactly those amounts and shows the full legal preview;
only then „Zastosuj zmiany”. The customer may instead type their own values → „Przelicz”; if
still infeasible, the gap and the correction are recomputed for their values. With no safe
correction: „Nie znaleziono bezpiecznej korekty przy obecnych ograniczeniach.” + the remaining
blocker + Wróć (manual values still allowed). HOME: „Tych ustawień nie da się teraz połączyć.
Gellatti proponuje najmniejszą zmianę, która pozwala prawidłowo przeliczyć recepturę.”

**Part C — HOME.** `Przelicz i popraw` now opens ONE modal with the same card and conflict
panel (simpler wording; grams masked for Demo). HOME Crown rules are untouched.

## 2. Architecture reused (EXISTING SOLUTION FIRST)

| Need | Existing authority reused | New code |
|---|---|---|
| Solve / feasibility | `buildOptimizePreview` + `bindProductBehaviorToPreview` — unchanged | none |
| Apply trust | `VerifiedApply.commit` (the ONE door) — generalises the existing session-authorized `suggested_fix` transition | instruction branch: re-derive the adjusted draft, recurse the full optimize door, rebase the record |
| Provisional state | `CLEAR_STAGED`, `cancelPreview`, draft-revision staleness | `previewInstructionAuthorization`, `lockConflict`, `pendingInstructionCommit` (staged content) |
| Off-thread work | the canonical `optimizePreview.worker` | new message kind `lock_conflict` + `lockConflictRuntime.ts` |
| Controls | `DirectNumberControl` + lock segment (recipe row) | none |
| Modal | `DialogShell` (PRO `ProRecalcPanel`; HOME now too) | `LockConflictPanel` content |
| Gap numbers | the Main envelope verdict's own sentence | parser pinned by a test against the real producer |

**Instruction semantics** (`previewInstructions.ts`, one pure definition shared by the preview
builder, the door and the diagnostic): a changed amount = `setPlannedGrams` (planned, typed
target, user-intent anchor); `locked` = `toggleLock` + `setGramLock` (both halves); unlocked at
an unchanged amount = a plain unlock; no hidden lock. Poured and engine-held lines are refused.

**Door.** An interactive Preview is built for the adjusted draft (= untouched recipe + session
instructions). `VerifiedApply.commit` re-derives that draft from the session authorization
(never from the payload), requires the untouched recipe's fingerprint + revision, runs **every**
optimize check on the adjusted draft (Main-proof rebuild, hard residuals, iteration cap,
improvement invariant, ProductBehavior…) by calling itself, and only then rebases the history
record onto the untouched recipe. One history entry; Cofnij restores the exact pre-preview recipe
and constraints.

**Minimum-relaxation diagnostic** (`lockRelaxation.ts`). Not a second solver: it asks the
unchanged pipeline the same question with some customer padlocks moved; a probe is feasible only
when that pipeline returns an applicable, whole-gram, non-diagnostic Preview. Objective, in
order: least total gram change → fewer moved locks → smaller largest relative change → recipe
order. Candidates: every single-lock relaxation (bisected to the whole gram closest to the
customer's amount) and the joint relaxation of all locks tightened lock by lock. Deterministic
probe budget (72), never wall-clock. The published set is re-probed before it is shown. If even
releasing every customer lock finds no legal recipe, the locks are not the cause and the existing
refusal keeps its explanation. Carrier minimum, Main floor/hard limit, ProductBehavior, ranges,
batch, identity: never touched.

## 3. Owner scenarios — measured on the real pipeline (offline, real Mapper rows)

Milk gelato −11 °C, WATERMELON Main (floor 20 %, hard 45 %, carrier 30 %), STRAWBERRY + CRANBERRY
secondary.

| Case | Refusal today | Diagnostic (probes, time) | Proposal | Re-solve |
|---|---|---|---|---|
| 1000 g, S 100 🔒 + C 130 🔒 | `impossible_under_constraints`, Main floor 10 % < 20 % | 37 probes, 176 ms | **only Strawberry 100 → 45 g**; Cranberry stays 130 g | legal, 0 violations |
| 700 g, same locks | Main floor + carrier 28,1 % < 30 % | 31 probes, 157 ms | Strawberry 100 → 53, Cranberry 130 → 69 | legal |
| 600 g, same locks | Main floor + carrier 22,7 % < 30 % | 32 probes, 107 ms | Strawberry 100 → 46, Cranberry 130 → 59 | legal |
| 1000 g, nothing locked | — | — | Cranberry 130 → 1 g, Strawberry 100 → 1 g, Watermelon → 366 g (strong reduction, PR #276 decrease-only) | legal |
| 1000 g, Strawberry 100 🔒 | — | — | Strawberry exactly 100 g, Cranberry → 1 g | legal |

600 g: Cranberry alone *can* be moved (to ≤ 1 g), but every single-lock correction costs more
grams than the joint 125 g one — proven by exhaustive whole-gram descent in the test.

## 4. Files

Changed: `applyPipeline.ts` (protected), `constraintStudioStore.ts` (protected),
`constraintStudioCopy.ts`, `optimizePreview.worker.ts`, `ui/ConstraintPreviewCard.tsx`,
`pro-core/ProRecalcPanel.tsx`, `home-creator/ui/HomeRecalculate.tsx`,
`home-creator/ui/HomeRecipeSection.tsx` (one prop line), `reports/GELLATTI_HOME_MASTER_CHECKLIST.md`
(H-60-1, H-60-2 → TESTED).
New: `previewInstructions.ts`, `lockRelaxation.ts`, `lockConflictRuntime.ts`,
`ui/LockConflictPanel.tsx`, `__fixtures__/ownerFruitMainFixture.ts`.
Untouched: Engine, scoring, Mapper, Search, Scanner, Product Intelligence (Main envelope),
Processing Rules, DB schema, Supabase (incl. every Edge source), production.

## 5. Tests added

| File | Cases | Covers |
|---|---|---|
| `previewInstructions.test.ts` | 14 | row semantics, no hidden lock, Main keeps role, refusals, immutability, merge |
| `lockRelaxation.test.ts` | 9 | owner 600 g (both move, exhaustive minimality, 1 g-closer infeasible), 4A one lock, 4C smallest of several, determinism, session instructions, locks-not-the-cause, probe budget honesty, gap parser pinned to the real verdict, diagnosable gate |
| `interactiveRecalculationFlow.test.ts` | 9 | real store runtime: fixtures 1, 1b, 2, 3, 5, 6, 7, 8 (HOME) + forged/stale door |
| `ui/ConstraintPreviewCard.interactive.runtime.test.tsx` | 6 | control + padlock, Zastosuj ↔ Przelicz, merge, reset on new proposal, static non-editable lines, Demo mask |
| `ui/LockConflictPanel.runtime.test.tsx` | 7 | PRO copy + gap + order, Użyj propozycji, own value → Przelicz, another lock, session merge, HOME copy, no safe correction |
| `home-creator/ui/HomeRecalculate.runtime.test.tsx` | 5 | one modal, edit → Przelicz, Apply closes, HOME conflict, X discards, Demo mask |
| `pro-core/ProRecalcPanel.interactive.runtime.test.tsx` | 3 | conflict inside the same modal (no dead end), interactive card, X discards provisional / keeps ordinary preview |

## 6. Gates (local, `TZ=Europe/Madrid`, feature commit `432dfef9` on base `c65e52ef`)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`tsc -b`) | ✅ exit 0 |
| Lint | `npm run lint` | ✅ 0 errors (8 pre-existing warnings, none in a changed file) |
| Build | `npm run build` | ✅ exit 0 |
| Owner-locked contracts | `npm run test:contracts` | ✅ 23 files / 225 tests |
| CI contract guards | `guardOwnerLockedContracts`, `guardProtectedPaths` (2 semantic changes, acknowledged), `guardHomeLedger` (H-60-1, H-60-2 moved), `git diff --check` — all `--base origin/staging` | ✅ |
| New tests | 7 files listed in §5 | ✅ 53 / 53 |
| Related suites | constraint-studio, pro-core, home-creator, product-intelligence, owner-locked, copy guards, components/ui, pages/home, pages/pro | ✅ 2 713 passed; 1 boundary pin found → fixed without touching the guard |
| Full suite | `npm test` | 1 137 files / 14 099 tests passed; 1 source pin (`noChangePreviewClearsBlocker.test.ts` wants the literal `if (result.code === 'already_clean') {`) → literal restored, guard nested inside; re-run 4 files / 50 tests ✅ |
| Production Rescue bundle | `npm run production-rescue:bundle-check` | ⚠️ reports stale on clean `origin/staging` too (pre-existing); in-suite `productionRescueEdgeBundle.test.ts` ✅; no changed file is in its 65-file closure |

The PR's CI repeats every job, including the isolated Solver-time and Starter-pack Direction
lanes.

## 7. Deviations and known limits (decided, not open questions)

1. **Copy voice.** The brief's „Gellatti znalazło…” violates the live guard „Gellatti as one
   gender-neutral voice” (`friendlyLabRuntimeCopy.test.ts`). Shipped: „Gellatti proponuje
   najmniejszą korektę…” / „…najmniejszą zmianę…”. Same meaning, present tense.
2. **HOME Crown AUTO→MANUAL.** The AUTO/MANUAL switch described in the brief is not on staging
   (it lives on the unpushed PACKAGE 2A branch the owner ordered reworked). Staging HOME offers
   the Crown to every added BASE line and toggles per line. This task changes neither; fixture 8
   proves the preview writes no Crown and no 1 g seed on HOME.
3. **Existing one-lock Suggested Fix** (`impossible_under_constraints` with a solver-computed
   `nearestFeasibleGrams`) stays the accepted path for ordinary runs; its preview is now
   interactive too. Every lock refusal WITHOUT such a value (the owner's case) goes to the new
   diagnostic.
4. Range constraints are held (search bounds, not exact instructions); percent locks relax as
   gram locks. Solver-added proposal lines are shown but not editable (their product authority
   is proposal-scoped).
5. Interactive run whose adjusted draft needs no solver change → „Te ustawienia nie wymagają
   dodatkowej korekty receptury.” + „Zastosuj zmiany” writes the customer's own amounts/padlocks
   through the row actions (no solver proposal exists, so no Cofnij record — same as editing rows).
6. HOME still has no Cofnij (pre-existing; not in scope).
7. Pre-existing, not touched: `npm run production-rescue:bundle-check` reports the committed
   Production Rescue Edge bundle stale on clean `origin/staging` `c65e52ef` too (the in-suite
   `productionRescueEdgeBundle.test.ts` passes). No file of this change is in that closure.
