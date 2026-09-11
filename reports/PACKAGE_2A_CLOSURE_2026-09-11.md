# PACKAGE 2A — closure on current staging (2026-09-11)

Owner brief: **„CLOSE PACKAGE 2A ON CURRENT STAGING — CURRENT-STATE RECONCILIATION + FINAL CHECKLIST"**.

| | |
| --- | --- |
| Staging | start `0b42b206` (#284) → re-fetched `a7478aa7` (#285, #287 landed mid-task) → `0b52fde1` (#288, #289 — no shared file) → final base `162bebf4`: #290 landed first; the two predicted textual conflicts (the HOME import, ledger H-50-1) resolved, `recipeStore.ts` auto-merged |
| Worktree / branch | `~/Developer/pinguino-2a-closure` · `claude/package-2a-closure` |
| Historical branch | `claude/package-2a-priority-crowns` (`032dac4a`, `0c0c79b9`, never pushed) — **reference only, nothing merged** |
| PR / merge / served SHA | recorded in the follow-up after merge (§6) |
| Production | untouched (`main` not written, no production deploy) |

## 1. Current state, audited before any change

**HOME Crown (staging `a7478aa7`).** Every HOME add path asked `setMainIngredient(line, 'home')`, so every
Crown-eligible user-added product arrived with a **visible** crown. HOME's `CrownControl` calls
`setLockType(line, isMain ? 'unlocked' : 'main', 'home')`. HOME Protein is mass-neutral (0 g stays 0 g);
HOME Gelato/Sorbet/Vegan get the shared 1 g seed at 0 g. There was no AUTO/MANUAL state at all. HOME's
padlock called `setLockType` on the store's default (PRO) surface.

**PRO Crown.** `setMainIngredient` / `setStandardIngredient` / `setLockType` on the default surface:
0 g + Crown → 1 g Main for every profile (#268, GEL-P0-037); Crown OFF returns an untouched seed to 0 g and
keeps the line's snapshot (#285); positive grams unchanged; #276's secondary-flavour bound in the Main search.

**Shared store actions** (§13): the surface parameter (`'pro' | 'home'`, #268) is the only HOME/PRO
separation; nothing branches on profile except HOME's own Protein seed rule, which is scoped to the HOME
surface. **HOME recalculation** is `HomeRecalculate` — „Przelicz i popraw" with the interactive preview
modal (#287, owner part C). There is **no** HOME auto-recalculation on staging.

## 2. Historical Package 2A — every change classified

A = already on staging · B = superseded by later accepted work · C = genuinely missing (implemented here,
re-authored against current staging) · D = obsolete, must not return · OD = left for an owner decision.

| Historical change (032dac4a / 0c0c79b9) | Class | Why |
| --- | --- | --- |
| `priority_mode` AUTO/MANUAL, `@/features/recipe-priority`, invisible AUTO crowns | **C** | Missing on staging. Re-authored minimal (48-line module, no `pressCrown` router) |
| AUTOMATIC door vs CONSCIOUS doors; one-way AUTO→MANUAL; PRO uncrown ends AUTO (cross-mode rule) | **C** | Missing. Re-done HOME-surface-scoped on top of #268 |
| HOME add paths (`HomeCreatorPage`, `useHomeIntentIngredients`) through the automatic door | **C** | Re-done; plus the MANUAL amount question the old branch lacked |
| `recipeStore.priorityCrowns.test.ts`, `crossModePriority.test.ts`, wiring/parity tests | **C** | Re-authored as `recipeStore.homePriority.test.ts` + updated source pins |
| Crown-as-role: delete `crownAutoSeed.ts` + `crownAutoSeededLineIds`, no seed for ANY profile | **D** | #268: PRO keeps 0 g + Crown → 1 g for all four profiles |
| Revalidation deferred to `setPlannedGrams` (a consequence of the seed deletion) | **D** | Tied to the deleted seed; #285 solved the 0 g snapshot problem differently |
| `recipeStore.mainResolutionReservation.test.ts` edits for no-seed | **D** | Same |
| Owner-locked edits GEL-P0-002/003/017 + new GEL-P0-034/035/036, `docs/OWNER_LOCKED_CONTRACTS.md` | **D** | They encoded the global no-seed. GEL-P0-037 now owns the surface rule; this closure changes no owner-locked file |
| HOME auto-recalculation (`homeAutoRecalculation.ts`, `useHomeAutoRecalculation.ts`, loop tests, `HomeRecalculate.tsx`, copy, `homeFinalRow` contract) | **B** | Superseded by #287 (owner part C, 2026-09-11): HOME keeps „Przelicz i popraw" with a consent modal. §9: must not return |
| Topping 5 %-of-base default (`toppingAmountAuthority.ts`, `recipeCompositionPersistence.ts`, topping tests) | **OD-3** | Never on staging (HOME adds a topping at 0 g). Lives in the Production Rescue Edge closure; brief: „do not redesign topping" |
| `setStandardIngredient` no longer writing `user_intent_anchor_grams` on crown-off (2A's PRO root cause) | **OD-4** | A PRO solver-input change; §5/§7 preserve PRO and #276 exactly — not reopened without a proven regression |
| Regenerated `supabase/functions/_shared/generated/productionRescueEngine.*` | **D** | Only needed because the old branch touched the Edge closure |
| `reports/PACKAGE_2A_PRIORITY_CROWNS_2026-09-10.md` | **B** | Superseded by this record |
| Local Search pieces (`compoundStem`, `homeDefaultProducts`, HOME-local resolver) | **D / A** | Central Search/Concept Resolver is the authority; none exist in `src/` |
| HOME/PRO surface parameter, HOME Protein mass-neutral, PRO 1 g seed, #285 snapshot keep, #276 bound, topping never crowned | **A** | Already on staging; untouched |

## 3. What landed (class C only)

- **State.** `recipeStore.priority_mode: 'AUTO' | 'MANUAL'` — persisted draft material (`recipePersistPartialize`),
  `MANUAL` by default; `fromPreset` (initial state, `loadPreset`, `startNewRecipe`, `rebuildNewRecipeStarter`,
  `resetToDemo`) and `loadRecipeInput` all reset it to MANUAL. A pre-2A persisted draft hydrates as MANUAL; an
  unknown value behaves as MANUAL.
- **HOME starts in AUTO.** `generateRecipe` sets AUTO right after `rebuildNewRecipeStarter` and before the chips.
- **AUTOMATIC door.** `grantAutomaticPriority(line)` asks the canonical `setMainIngredient(line, 'home')` only
  while AUTO (ineligible products still refused; HOME's own seed rule unchanged) and never changes the mode.
  Both HOME add paths (picker, intent chip / scanner) use it. Toppings never reach it.
- **Invisible.** HOME renders `visibleCrownLineIds(items, mode)` — `[]` in AUTO, the Main set in MANUAL.
  `CrownControl`'s `isMain` reads the same list, so in AUTO every press is a first conscious crown.
- **First HOME crown** (`setLockType(line, 'main', 'home')` in AUTO): `firstManualHomeCrown` releases every other
  Main line in one write — grams kept, lock restored from its own constraints, no intent anchor, no
  ProductBehavior snapshot write (like HOME's own Crown door), the automatic seed provenance and any Crown-bootstrap provenance (#290's rule) end — and the draft
  becomes MANUAL for good. Several crowns afterwards; removing one keeps the others.
- **MANUAL adds.** A new BASE line gets no priority. HOME asks its amount (`HomeAmountPrompt`) on the picker,
  intent-chip and scanner paths instead of creating a 0 g line (§B); `decideAddAmount` takes `{ autoPriority }`.
- **Surface safety.** HOME's padlock now names the HOME surface; a PRO crown/uncrown on a draft still in AUTO
  (a conscious choice PRO displays as a crown) ends AUTO; PRO Crown semantics unchanged.
- **Tutorial (§19).** `ingredient-settings` targets `home-recipe-line` (the row carrying the crown and ⋯) through
  the existing SAFE tutorial architecture; the `recipe` step now names the real „Przelicz i popraw" preview.
  The two „DEFERRED UNTIL PACKAGE 2A INTEGRATION" markers are annotated closed.
- **Ledger.** H-49-1 re-expressed (old wording kept inline); H-50-1 evidence + owner-decision blocker.

## 4. Owner decisions — not implemented, with the reason

**OD-1 · HOME 0 g + Crown stays 0 g (§4, §15; checklist 19–22, 77).** HOME Gelato/Sorbet/Vegan still get the 1 g
seed at 0 g through the shared Crown path. Removing it alone dead-ends HOME: HOME adds flavours at 0 g and the
owner-locked §B flow lets „Crown decide" their amount, and the Przelicz dose gate (`missingProductDosePreviewIssue`)
refuses every Base line below 1 g („Minimalna ilość to 1 g"). HOME Protein already keeps 0 g and stops exactly
there (H-50-1, the zero-gram handoff PR #266 flagged). What IS delivered: every HOME Crown **press** after AUTO
is mass-neutral, and the automatic gram becomes an ordinary amount. Options: (a) HOME asks the amount on every
0 g add; (b) the dose gate hands 0 g priority lines to the solver on HOME (changes a frozen invariant);
(c) keep the 1 g for now. Recommended: **(b)**, together with OD-2.

**OD-2 · HOME auto-recalc (§9; checklist 24, 82).** None exists on staging to preserve. The historical 2A
auto-recalc conflicts with the owner-accepted #287 (HOME keeps „Przelicz i popraw" with a consent modal), so per
§9 it was not restored. The tutorial's recipe step was changed to describe the real runtime; revert that copy if
HOME auto-recalc is approved.

**OD-3 · Topping 5 % default (2A §8).** The brief calls it „existing"; staging adds a HOME topping at 0 g.
Landing it touches the Production Rescue Edge closure (`recipeCompositionPersistence.ts` → bundle regeneration)
and the brief says „do not redesign topping in this task".

**OD-4 · PRO uncrown intent anchor (2A's PRO root cause).** `setStandardIngredient` still writes
`user_intent_anchor_grams` on crown-off. A PRO solver-input change; §5/§7 forbid reopening PRO/#276 without a
proven regression.

**Known limits (recorded, not hidden).** (1) In AUTO a HOME padlock replaces that line's automatic priority with
the exact lock (one role field per line — the same rule by which a lock replaces a crown in MANUAL); unlocking
leaves it ordinary. (2) A recipe SAVED while still in AUTO reopens MANUAL with its priorities shown as crowns —
the saved-recipe payload has no field for the mode (adding one is a payload change). (3) If the customer
crowns a line while the generated chips are still arriving (the first second or two after „Zamień pomysł w
recepturę"), a later chip arrives in MANUAL and HOME asks its amount instead of creating it; several such chips
share HOME's one amount question, so only the last one is asked.

## 5. Tests and gates

New or updated tests:

| File | What it proves |
| --- | --- |
| `src/stores/recipeStore.homePriority.test.ts` (20) | §14 owner sequence at typed amounts; §14 from 0 g — every Crown press mass-neutral, the automatic gram becomes an ordinary amount; the first crown ends AUTO even on a lock-released line; §11 topping; §15 HOME Protein 0 g ON/OFF stays 0 g and editable; §16 PRO on an AUTO draft ×4 profiles (0 g → 1 g Main; OFF → Main removed, 0 g, snapshot kept; + from 0 g → 1 g) and PRO leaves a MANUAL draft alone; §13 the same HOME rule ×4 profiles, the HOME padlock never ends AUTO, the automatic door never changes the mode; §17 new BASE after MANUAL, recalculation, refresh + pre-2A hydration, every load path MANUAL |
| `src/features/recipe-priority/priorityMode.test.ts` (6) | the pure product-layer questions; an unknown persisted value behaves as MANUAL |
| `src/features/home-creator/homePriorityWiring.test.ts` | AUTO set after the starter rebuild and before the chips; both add paths use the automatic door; HOME renders only the customer's crowns; HOME padlock names HOME; in MANUAL no 0 g BASE line — the page asks the amount on all three intent/scanner sites; only HOME starts AUTO; no PRO file knows the mode |
| `homeAddAmountDecision.test.ts` | MANUAL asks for Crown-capable products; AUTO and the default unchanged; refusals mode-independent; no invented range |
| `tutorialSteps.test.ts` | ingredient-settings targets `home-recipe-line`, which HOME renders, found by data-testid, dropped while no line exists; the recipe step names the real control |
| `homeAddCrownParity.test.ts`, `scannedProductParity.test.ts` | stale `setMainIngredient(added.lineId, 'home')` pins moved to the automatic door; topping paths never reach it |

Focused regression suites, all PASS (16 files / 237 tests; 7 files / 107 after the tutorial copy change):
`recipeStore.crownSurface` (#268), `proCrownZeroGramSeed.contract` (GEL-P0-037), `crownMain.contract`,
`shellPersistence.contract` (GEL-P0-017), `crownAutoSeed`, `proMainSecondaryFlavourBound` (#276),
`proZeroGramCrownAuthority` (#285), `HomeRecalculate.runtime` + `interactiveRecalculationFlow` (#287),
`TutorialOverlay`, `tutorialState`, plus the new files above.

| Gate | Result |
| --- | --- |
| `git diff --check`, owner-locked guard, protected-path guard (acknowledged), HOME ledger guard, contracts 23 files / 225 tests | PASS |
| Changed-file ESLint (`--max-warnings 0`) and Prettier on changed TS/TSX only (unrelated reflow hunks reverted) | PASS |
| `verify:staging` (guards + contracts + `tsc -b` + `eslint .` + build) on the final head | PASS on `5354665d`: guards, contracts 23 files / 225 tests, `tsc -b`, `eslint .` (0 errors; the 8 warnings are pre-existing, all in files this change does not touch), build. The only later change is a comment rewording in `firstManualHomeCrown`, re-checked with changed-file ESLint and the store suites |
| Full suite (`a7478aa7` + this change) | 1140 / 1143 files, 14 161 / 14 164 tests (25 files / 129 tests skipped as configured). The 3 failures were wall-clock timeouts at load ≈ 19 from other sessions — classified below |

The first `verify:staging` stopped at typecheck on a test-only `string | undefined` destructuring in the new
store test; fixed before the rerun.

Interleaved A/B of the three timed-out suites — this branch `5354665d` vs a clean staging probe `0b52fde1`,
default limits:

| Run | Commit | Load | proteinMultiMainPositive four-Crown (15 s budget) | constraintStudioStore §19 (5 s) | proZeroGramCrownAuthority Sorbet (5 s) |
| --- | --- | --- | --- | --- | --- |
| A1 | branch | 5.9 | 14.5 s ✓ | 3.6 s ✓ | 2.2 s ✓ |
| B1 | staging | 10.1 | 11.3 s ✓ | 2.7 s ✓ | 1.4 s ✓ |
| A2 | branch | 14.7 | 12.3 s ✓ | 2.2 s ✓ | 1.4 s ✓ |
| B2 | staging | 14.7 | 11.3 s ✓ | 2.8 s ✓ | 1.6 s ✓ |

Verdict: load-induced. All pass at both commits, and at equal load the timings are indistinguishable (A1 was a
cold first run). The four-Crown test's 15 s wall-clock budget is tight on this machine at any commit — recorded,
not changed.

A local browser preview cannot exercise this flow: without `.env.local` the Supabase client is `null` (no
Mapper hydration, no ProductBehavior authority) and anonymous ProductBehavior is blocked by design. The HOME
Crown flow is verified on served staging (§6).

## 6. Merge, deploy, served QA

Recorded after merge, in a follow-up to this record: merge SHA, staging push-CI, served bundle SHA, and the owner's served checks A–L.

## 7. Final checklist

Recorded after served QA, in the same follow-up — every item 01–84 with its evidence.
