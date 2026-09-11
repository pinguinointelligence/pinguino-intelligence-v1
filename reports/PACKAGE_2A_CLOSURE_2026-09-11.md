# PACKAGE 2A — closure on current staging (2026-09-11)

Owner brief: **„CLOSE PACKAGE 2A ON CURRENT STAGING — CURRENT-STATE RECONCILIATION + FINAL CHECKLIST"**.

| | |
| --- | --- |
| Staging | start `0b42b206` (#284) → re-fetched `a7478aa7` (#285, #287 landed mid-task) → `0b52fde1` (#288, #289 — no shared file) → final base `162bebf4`: #290 landed first; the two predicted textual conflicts (the HOME import, ledger H-50-1) resolved, `recipeStore.ts` auto-merged |
| Worktree / branch | `~/Developer/pinguino-2a-closure` · `claude/package-2a-closure` |
| Historical branch | `claude/package-2a-priority-crowns` (`032dac4a`, `0c0c79b9`, never pushed) — **reference only, nothing merged** |
| PR / merge / served SHA | #292 · merge `a743aa06` (2026-09-11 12:58:03Z) · served bundle `index-CLlBeXrI.js` inlines `a743aa06` |
| Owner final decisions | #294 · merge `abc55956` (2026-09-11 17:45:36Z, head `ec195ec1`, base `774710ea`) · served bundle `index--tFxptnl.js` inlines `abc55956` |
| Production | untouched — `main` = `7fa36890` (2026-09-07), no production deploy |

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

## 4. Owner decisions — all resolved (owner final decisions, 2026-09-11)

**OD-1 — HOME 0 g / Crown / priority: IMPLEMENTED.** HOME's Crown and its automatic priority are mass-neutral for
every profile: `crownAutoSeedAllowed = (surface) => surface === 'pro'`, so HOME Gelato, Sorbet and Vegan no longer
seed (Protein never did). PRO keeps `0 g + Crown → 1 g + Main` for every profile.

„Przelicz i popraw" sizes a 0 g HOME priority line. The solver only sizes a line that is present, so HOME hands
every such line over as the Crown bootstrap (#290's `AUTO_CROWN_SEED` 1 g, no intent anchor, no typed target). It
does this on the provisional copy only — a `bootstrap` preview instruction through #287's instruction model. The
recipe keeps 0 g until „Zastosuj zmiany". The Apply door re-derives the same copy, and a bootstrap is never
committed as a customer row edit.

Only a legitimate priority line qualifies: the Main role, in AUTO or MANUAL. A 0 g ordinary line still asks for
its amount. The managed ProductBehavior pass (#290) now also resolves authority for a 0 g priority line with no
snapshot, asking the canonical required rule as if the line had one gram. GEL-P0-012 is untouched.

Probe on the real solver: the bootstrapped copy is sized for all four profiles — Gelato 333/333 g and Sorbet
437/437 g through the Direction best-achievable choice, Vegan 423/423 g, Protein 9/9 g. Plain 0 g lines are not
sized at all: Protein and Vegan refuse them, and Gelato and Sorbet leave them at 0.

**OD-2 — HOME auto-recalc: RESOLVED BY APPROVED SUPERSESSION.** The accepted HOME flow is #287: „Przelicz i popraw"
→ preview → the customer sees every change → applies it. The historical 2A auto-recalc must not return. The
tutorial copy „Tu jest Twoja receptura. „Przelicz i popraw” dopasuje gramy i pokaże każdą zmianę, zanim ją
zastosujesz." is approved.

**OD-3 — topping default: IMPLEMENTED.** A new HOME topping (picker or composer chip) starts at 5 % of the current
BASE mass (`defaultHomeToppingGrams`), and any later change is the customer's own amount. It stays outside BASE
priority and the Crown, and Engine-external. Production Rescue is not involved: the default is set at the HOME
add sites and touches no Edge-closure file.

**OD-4 — PRO uncrown / intent anchor: RESOLVED — NO IMPLEMENTATION REQUIRED.** No hidden intent anchor was
introduced. An unlocked amount may be changed by the Solver under the existing rules, a lock preserves the exact
user intent, and the Crown means priority / Main, not quantity protection. #276 remains final.

**Known limits — closed:**
1. *Lock in AUTO.* A HOME padlock makes the exact amount the authority: the line keeps its grams, leaves the
   automatic priority (a locked line cannot be moved, so its priority is moot) and never ends AUTO. Unlocking
   leaves it an ordinary line, the same explicit lock semantics as in MANUAL. Tested in §13.
2. *Save / reopen.* A draft saved while AUTO carries `pinguino_priority_mode_v1: 'AUTO'` on its saved input (the
   `pinguino_*_v1` extension family, at both save doors). The loose loader keeps it, and `loadRecipeInput`
   reopens AUTO. A MANUAL save carries no marker and reopens MANUAL. No DB migration.
3. *Several products needing an amount.* HOME's amount question is a queue: each product gets its own question in
   arrival order, and none replaces another.

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

**#292 (class C).** Merged 2026-09-11 12:58:03Z into staging `a743aa06` (`--match-head-commit`); staging push-CI
5/5 green; served `index-CLlBeXrI.js`. Follow-up #293 (this record + the tutorial quote fix) → `a6141618`.

**#294 (owner final decisions OD-1…OD-4 and the known limits).**
- Merged 2026-09-11 17:45:36Z into staging `abc55956` (parents `774710ea` + `ec195ec1`) with `--match-head-commit`;
  staging was still the PR base.
- Checks on the exact head `ec195ec1`: the required „Owner-locked contracts + protected paths", Direction rescue and
  both Vercel builds green; CI typecheck and lint green. Staging's push-CI on `abc55956` gives the same result.
- **Staging has been red since #291** (Mapper 2541 swap, merge `64995dc9`): its own full suite fails 135 tests in 34
  files (Mapper 2089 baselines, toolboxes, Production Rescue, Vegan/Sorbet Direction, …) and its solver job 2
  `recipeVectorProximity` tests. Package 2A adds none. Diffed against staging's own CI log test by test
  (`diff_failures.py`) and message by message (`compare_failure_messages.py`): 135/135 same tests, 0 new, 0 missing;
  134/135 identical text and the last identical once a log-chunk byte-order mark is stripped. The 16 inherited
  failures in files that import `recipeStore` or `constraintStudioStore` fail identically. Mapper/Search is outside
  this package (§20), so nothing there was touched.
- Local `verify:staging` on `ec195ec1`: exit 0 — contracts 23 files / 225 tests, `tsc -b`, `eslint .` (0 errors; the
  9 warnings are in files this package does not touch), build.
- **Deploy identity.** Served bundle `index--tFxptnl.js` inlines `abc55956` (×2). Markers: `pinguino_priority_mode_v1`
  ×3, `invalid_bootstrap` ×2, `AUTO_CROWN_SEED` ×4, `priority_mode` ×36, `grantAutomaticPriority` ×4.
- **Production** `main` = `7fa36890`: untouched.

**Served QA method.** The in-app Browser pane, signed in by the owner as the PRO QA account (no password typed).
Its storage is shared, so every draft key was shimmed to memory. A fresh HOME journey needs a draft that is not yet
`recipeReady`, and no UI path resets one, so each fresh cycle snapshotted the 11 real draft keys to sessionStorage,
removed only the HOME draft, reloaded, and restored every real key byte for byte before continuing in memory. After
the last cycle all 11 keys were byte-identical to the original. Two QA recipes were saved under the QA account for
save/reopen (owner-authorised): `3debb0a1…` (MANUAL) and `a76a4a62…` (AUTO). No PRO save.

| Check | Served result on `abc55956` |
| --- | --- |
| A — HOME add 4 BASE → no visible auto Crowns | **PASS.** Fresh Gelato (Magimix, 950 g): banana, dark chocolate, strawberry and cranberry arrive as `main` at **0 g** (no seed — OD-1), mode AUTO, all four Crowns unpressed, no prompts. Repeated in a second cycle; Sorbet (mango + raspberry) and Protein (banana + strawberry) behave the same |
| B — Crown one → only that one is manual priority | **PASS.** Crowning banana → MANUAL; banana `main` and pressed; chocolate, strawberry and cranberry released to `unlocked` |
| C — grams do not change from Crown | **PASS.** Every gram identical across each Crown press in B, D and E |
| D — Crown second → both priority | **PASS.** Banana and chocolate both `main`, both pressed |
| E — remove first → only second remains | **PASS.** Uncrowning banana leaves only chocolate; no intent anchor written |
| F — TOPPING unaffected | **PASS.** HARIBO Quaxi added while AUTO at **48 g = 5 % of the 950 g base** (OD-3): „TOPPING" marker, no Crown, mode still AUTO, the four priorities untouched; 48 g kept through recalculation, Crowns, save and reopen |
| G — HOME 0 g Crown → stays 0 g | **PASS.** Protein: crowning banana at 0 g keeps it at **0 g**, `main`, pressed, no provenance, no anchor; the released strawberry stays an ordinary 0 g line. „Przelicz i popraw" then asks only for that ordinary line („Podaj gramaturę dla: STRAWBERRY … Minimalna ilość to 1 g.") and never for the crowned priority line; with banana alone it sizes banana 0 → 82 g and applies (H-50-1 closed) |
| H — PRO 0 g Crown → 1 g Main | **PASS ×3.** PRO's picker adds BANANA · Fresh Fruit at 0 g; Crown ON → **1 g `main`, `AUTO_CROWN_SEED`**; Crown OFF → 0 g, `unlocked`, grams editable — Gelato, Sorbet and Vegan (each via „Utwórz wersję …") |
| I — PRO Protein 0 g Crown → 1 g Main | **PASS.** Crown OFF on the 0 g Main → 0 g, editable; Crown ON → 1 g `main`, `AUTO_CROWN_SEED`. A 5 g line crowned ON and OFF keeps 5 g |
| J — PRO Main search respects #276 | **PASS.** `a76a4a62` reopened in PRO; Crown OFF on chocolate, strawberry and cranberry (anchors 155 g; the PRO uncrown ends AUTO) → PRO „Przelicz": banana (Main) 156 → 398 g, secondaries 155 → 123 / 1 / 132 g — none increased. Preview closed without applying |
| K — HOME recalculation as accepted (OD-2) | **PASS — resolved by approved supersession.** „Przelicz i popraw" → preview → „Zastosuj zmiany". Gelato's four 0 g priorities sized 156/155/155/155 g (950 g) through „Gellatti proponuje:", no „Minimalna ilość"; the recipe stays 0 g until Apply; after Apply still AUTO, Crowns hidden, no `AUTO_CROWN_SEED` left. Sorbet mango and raspberry 0 → 562 g each |
| L — tutorial carries no stale 2A dependency | **PASS.** „Uruchom samouczek ponownie" → 8 steps (the chip step present because this recipe has chips). 6/8 spotlights `home-section-recipe` with the approved OD-2 copy; 7/8 spotlights `home-recipe-line` („Korona = priorytet. Gdy sam wybierzesz koronę, priorytet mają tylko składniki oznaczone przez Ciebie…") |
| Save / reopen (known limit 2) | **PASS.** The MANUAL recipe reopens MANUAL with identical lines and chocolate's Crown shown. The AUTO recipe, opened right after it, switches the store back to **AUTO** with identical lines and all four priorities hidden |
| Known limit 1 — padlock in AUTO | **PASS.** Sorbet in AUTO: „Zablokuj ilość" on raspberry → `grams` lock at 562 g, AUTO kept, mango's hidden priority kept, no Crown shown; „Odblokuj ilość" → an ordinary line, AUTO kept |
| Known limit 3 — one question per product | **PASS.** In MANUAL, mango and raspberry resolved together → „Ile chcesz dodać MANGO…?" (60 g), then „…RASPBERRY · Puree?" (40 g); both land as ordinary lines, no Crown, no 0 g line |

**Also found on served staging — not caused by Package 2A, each filed as a follow-up task:**
1. *Blank HOME refusal.* #287's refusal view (`HomeRecalculate.tsx`, `432dfef9`) renders only „Wróć" when the
   pipeline's own sentence is filtered out, and has no fallback sentence. Reached on a Sorbet recipe after Gellatti's
   Direction proposal plus a padlock round trip; the save gate then asks „Przelicz recepturę, aby zapisać." with no
   way through.
2. *First-run slow solve, then an authority refusal.* Protein, a 1 g seeded Main next to a secondary fruit given 5 g:
   the session's first „Przelicz" solves for 15–20 s on served, then refuses („Nie możemy teraz potwierdzić danych
   jednego ze składników.") or times out; later runs take about 1 s. The same happens through PRO's own #290 seed and
   the ordinary run (A/B on served), so it is not the OD-1 bootstrap. Server validation answered `ready: true`; offline
   the same pipeline takes about 150 ms.

## 7. Final checklist

Every row is closed by evidence on current staging. „Served" rows were run on the served build of the #294
merge (§6). Rows 24 and 82 are closed by the owner's approved supersession (OD-2); row 34 carries the owner's
no-change decision (OD-4).

- [x] 01. Current origin/staging fetched — before every step; #294's base `774710ea`, re-fetched before merge
- [x] 02. Exact staging SHA recorded — `0b42b206`→`a7478aa7`→`0b52fde1`→`162bebf4`; #292 `a743aa06`; #293 `a6141618`; #294 base `774710ea` → merge ``abc55956``
- [x] 03. Clean isolated worktree used — `~/Developer/pinguino-2a-closure`
- [x] 04. Historical Package 2A treated as reference only — §2 classification A/B/C/D
- [x] 05. Old branch NOT blindly merged — only class C rebuilt on staging
- [x] 06. Current HOME Crown behavior audited first — §1
- [x] 07. Current PRO Crown behavior audited first — §1
- [x] 08. HOME AUTO mode present — `priority_mode`; served A
- [x] 09. All user-added BASE internally priority in AUTO — served A
- [x] 10. AUTO priority invisible — served A (no pressed Crown)
- [x] 11. No automatic visible active Crown — served A
- [x] 12. First manual Crown switches AUTO→MANUAL — served B
- [x] 13. Only manually crowned BASE priority after MANUAL — served B
- [x] 14. Previous hidden AUTO priorities removed — served B
- [x] 15. Multiple manual Crowns supported — served D
- [x] 16. Removing one Crown preserves other manual Crowns — served E
- [x] 17. TOPPING excluded from BASE priority — served F
- [x] 18. TOPPING does not trigger AUTO→MANUAL — served F (topping added while AUTO; mode stays AUTO)
- [x] 19. HOME Crown mass-neutral — OD-1 implemented (`crownAutoSeedAllowed = surface === 'pro'`); served C, G
- [x] 20. HOME Crown does not change grams — served C
- [x] 21. HOME 0 g + Crown remains 0 g — served G
- [x] 22. HOME does NOT receive PRO 1 g seed — served G; the 1 g lives only in the recalculation's provisional copy
- [x] 23. HOME manual grams remain functional — served (amount prompt, grams edit)
- [x] 24. HOME auto-recalc preserved — RESOLVED BY APPROVED SUPERSESSION (OD-2): #287 „Przelicz i popraw" → preview → apply is the accepted HOME runtime; tutorial copy approved
- [x] 25. PRO remains manual-recalc where designed — unchanged; served H–J
- [x] 26. PRO 0 g + Crown → 1 g — served H
- [x] 27. PRO Gelato seed PASS — served H
- [x] 28. PRO Sorbet seed PASS — served H
- [x] 29. PRO Vegan seed PASS — served H
- [x] 30. PRO Protein seed PASS — served I
- [x] 31. PRO Crown OFF keeps grams editable — served H
- [x] 32. PRO positive grams unchanged by Crown — served H
- [x] 33. PR #268 behavior preserved — GEL-P0-037 (surface-only rule), crownSurface suite
- [x] 34. PR #276 behavior preserved — RESOLVED / NO IMPLEMENTATION REQUIRED (OD-4); served J
- [x] 35. Secondary flavour may decrease — `proMainSecondaryFlavourBound`; served J
- [x] 36. Secondary flavour cannot increase — `proMainSecondaryFlavourBound`; served J
- [x] 37. Real grams lock preserved — lock suites; AUTO padlock = explicit lock (known limit 1 closed)
- [x] 38. Real percent lock preserved — lock suites
- [x] 39. Real range lock preserved — lock suites
- [x] 40. Main envelope preserved — Main envelope suites
- [x] 41. Carrier floor preserved — carrier suites
- [x] 42. Multi-Main preserved — multi-Main suites; served D
- [x] 43. Invalid fallback remains fail-closed — `invalid_bootstrap` refusal + fail-closed suites
- [x] 44. HOME/PRO behavior separated by surface — seed rule reads the surface only
- [x] 45. No profile-based HOME/PRO leakage — the profile branch is gone from `crownAutoSeedAllowed`
- [x] 46. Shared store actions audited — `setMainIngredient`, `setLockType`, `setStandardIngredient`, grams, recalc
- [x] 47. Mapper/Search not modified — no file under Mapper/Search in #292/#294
- [x] 48. No local HOME resolver reintroduced
- [x] 49. compoundStem not restored as final architecture
- [x] 50. homeDefaultProducts not restored as final architecture
- [x] 51. AUTO→MANUAL persistence checked — refresh + save/reopen (served)
- [x] 52. New BASE after MANUAL does not silently regain AUTO priority — served (amount asked, no crown)
- [x] 53. Recipe state/reopen behavior checked — known limit 2 closed: `pinguino_priority_mode_v1` in the saved input, no migration; served save/reopen
- [x] 54. Stale Package 2A executable assumptions removed
- [x] 55. SAFE tutorial dependency reviewed
- [x] 56. Ingredient/settings tutorial step completed — served L
- [x] 57. No stale "waiting for Package 2A" marker remains
- [x] 58. Focused HOME tests PASS — 45 files / 493 tests on #294's tree
- [x] 59. Focused PRO tests PASS
- [x] 60. PR #268 regression tests PASS
- [x] 61. PR #276 regression tests PASS
- [x] 62. Tutorial regression tests PASS
- [x] 63. Typecheck PASS — local `tsc -b` 0 errors on `ec195ec1`; CI typecheck step green in CI on `ec195ec1` and on the staging push of `abc55956`
- [x] 64. Changed-file lint PASS — 0 errors / 0 warnings in the files #294 changes
- [x] 65. Build PASS — local build on `ec195ec1`; Vercel builds of the PR head and the merge
- [x] 66. verify:staging PASS — local on `ec195ec1`, exit 0
- [x] 67. Full suite PASS for Package 2A — 0 new failures: the same 135 tests fail with the same messages as staging's own CI on `774710ea` (red since #291, Mapper 2541 swap); 15 010 pass; none in a Package 2A file
- [x] 68. Current staging re-fetched before merge
- [x] 69. Final reconciliation clean
- [x] 70. Only genuine missing closure changes merged — #292 (class C) + #294 (owner decisions)
- [x] 71. Canonical staging deployed
- [x] 72. Served SHA verified — `index--tFxptnl.js` inlines `abc55956` with the new code (`pinguino_priority_mode_v1` ×3, `invalid_bootstrap` ×2)
- [x] 73. Production untouched — `main` `7fa36890`
- [x] 74. Served HOME 4-ingredient AUTO test PASS — A
- [x] 75. Served AUTO→MANUAL test PASS — B
- [x] 76. Served HOME mass-neutral Crown test PASS — C
- [x] 77. Served HOME 0 g no-seed test PASS — G
- [x] 78. Served PRO 0→1 test PASS — H
- [x] 79. Served PRO Protein 0→1 test PASS — I
- [x] 80. Served PR #276 Main-search regression PASS — J
- [x] 81. Served TOPPING exclusion PASS — F
- [x] 82. Served HOME auto-recalc PASS — RESOLVED BY APPROVED SUPERSESSION (OD-2); served K: „Przelicz i popraw" → preview → apply
- [x] 83. Historical Package 2A branch marked SUPERSEDED / DO NOT MERGE
- [x] 84. PACKAGE 2A = CLOSED / RECONCILED TO CURRENT STAGING
