# Production Flow UX and Correction Repair

Date: 2026-08-25
Environment: STAGING only
Served-browser A–H runtime commit: `368fc3e9d28378a8b0f457a4cead6df8985f7830`
Final integrated runtime and repository-gate commit: `d913b7f05f7e85850aa013e68d3a44c96458b4dd`
Staging application: <https://staging.pinguinoai.com>
Staging Supabase project: `tunabqqrwabacxjcxxkz`
Production Supabase project `riwipywgqobrulyzrzad` was not changed.

## Executive result

The Production workspace now follows the physical workflow directly:

```text
ODWAŻ
→ WPISZ FAKTYCZNĄ ILOŚĆ
→ POTWIERDŹ DODANIE
→ JEŚLI JEST ODCHYLENIE: WYBIERZ JEDNĄ Z OBLICZONYCH DECYZJI
→ POTWIERDŹ TOPPINGI
→ ZAKOŃCZ PRODUKCJĘ
```

Physical confirmation, quantity difference, correction of a mistaken record, positive top-up, correction choice, and completion are now separate states and actions. Every correction option is calculated automatically against the current durable actual/rescue revisions. Unsafe or infeasible choices are disabled with a visible reason before the user can select them.

## Previous state machine

The old interaction compressed several different facts into the same row/control:

```text
planned grams
  └─ editable actual grams
       ├─ visually ambiguous confirmation/reset/correction control
       └─ status could become “RÓŻNICA”
            └─ difference replaced physical state

confirmed deviation
  └─ three similar Preview cards
       ├─ manual/internal Rescue language
       ├─ no stable selected/recommended hierarchy
       └─ stale preview could coexist with newer physical grams

completion
  ├─ unclear disabled CTA
  ├─ no explicit final lower-score receipt
  └─ native browser confirmation on mistaken-entry correction
```

The practical problems were:

- an edited draft and a physically added quantity were not explicit independent facts;
- `RÓŻNICA` was presented like a physical status;
- `0` could be visually/statefully ambiguous unless explicit confirmation was retained;
- increasing a physical quantity and correcting an incorrect historic entry looked like the same operation;
- manual preview state competed with the current durable revision;
- mass language hid overshoot behind a zero-remaining presentation;
- completed sessions could be incorrectly rebound to a newer recipe version during recovery.

## Corrected state machine and sources of truth

### Ingredient line

```text
DO DODANIA
  └─ operator edits draftActualGrams
       └─ DO POTWIERDZENIA
            └─ explicit confirmation
                 └─ DODANO
                      ├─ Dodaj kolejną ilość
                      │    └─ positive cumulative physical addition only
                      └─ Popraw zapis
                           └─ explicit mistaken-entry modal
                                └─ durable historical correction event
```

The line now keeps these authorities separately:

- `plannedGrams`: immutable original plan;
- `targetGrams`: active accepted correction target;
- `draftActualGrams` + `draftActualEdited`: local, unconfirmed input;
- `physicalAddedGrams`: confirmed physical fact;
- `confirmedAt` + `confirmationOrder`: physical chronology;
- durable actual revision: server concurrency authority.

`physicalAddedGrams` is the lower bound for normal correction and enlargement. A positive top-up may increase it. Only the explicit mistaken-entry flow may replace an incorrectly recorded historical value.

### Deviation decision

```text
confirmed actual changes
  └─ durable actual revision increments
       └─ old authorizations invalidated
            └─ all 3 standard choices calculated automatically
                 ├─ available → outcome, score, mass, instructions
                 ├─ unavailable → disabled + exact reason
                 └─ transient failure → retry only for that calculation
                      └─ one selected/recommended choice
                           └─ one context-aware primary CTA
                                └─ durable decision + rescue revision
```

The decision receipt is `lastDeviationDecision`, reconstructed from the append-only `deviation_decision_accepted` event. It records strategy, accepted time, source actual revision, rescue revision, final mass, and score. Progress, vessel mass, target, score, options, selection, and completion all derive from the current session snapshot and durable revisions.

### Completion

```text
all Base lines confirmed
  + decision resolved or not needed
  + all Toppings confirmed
      └─ score unchanged → complete
      └─ accepted lower score → custom 10 → 8 final confirmation
           └─ atomic durable completion + immutable completed snapshot
```

## UI hierarchy changes

The wide table is now:

```text
SKŁADNIK | PLAN | FAKTYCZNIE | STATUS / POTWIERDZENIE | ODCHYLENIE
```

The top instruction is the readable three-step physical workflow, followed by the permanent rule that confirmed material cannot be subtracted from the vessel.

The right panel order is now:

1. current Production state: progress, familiar score ring, vessel mass, target, remaining/excess;
2. deviation decision, only while unresolved;
3. compact process information;
4. topping stage and stateful final CTA.

Mass labels are dynamic:

- below: `Do dodania`;
- exact: `Do dodania 0 g`;
- above: `Ponad plan +… g`.

Row difference is independent from physical state, for example `DODANO` and `+2 g ponad plan` simultaneously.

## The three correction choices

| Choice | Physical rule | User-visible result |
|---|---|---|
| `Zachowaj 1000 g` | Confirmed actuals remain lower bounds; only feasible remaining/additional quantities may change. | Disabled immediately when the vessel already exceeds the target or when no safe exact-target vector exists. |
| `Powiększ partię` | Searches for the smallest safe larger target. Confirmed ingredients may receive positive additions; none may be reduced. | Shows final target, score and exact additions when available; otherwise shows the binding no-safe-larger-batch reason. |
| `Kontynuuj bez korekty` | Leaves the current physical/result vector unchanged. | Available only for a hard-safe result. Acceptance is durable, resolves the panel, and does not require a manual Rescue refresh. |

The familiar score component is reused for the current result and option outcome. Cards expose recommended, selected, warning/quality-loss, and unavailable states with text as well as visual treatment. One CTA below the cards applies the selected outcome.

## Root-cause findings and repairs

### 1. Draft input and physical confirmation were conflated

The UI inferred edit state primarily from value differences. An explicit `draftActualEdited` state now survives reconciliation without changing physical mass. `DO POTWIERDZENIA` therefore means an unconfirmed draft, while `DODANO` means a committed physical fact.

### 2. Correction and top-up were the same-looking action

Confirmed lines now expose two distinct flows:

- `Dodaj kolejną ilość`: modal accepts only a positive additional weighing and shows the cumulative result;
- record correction: opens the line as a draft, then requires a custom modal showing previous value, new value and consequence.

No `window.confirm` or browser-native prompt remains in this flow.

### 3. Correction previews could become stale

The previous manual preview lifecycle could outlive a later actual/rescue revision. The workspace now calculates all standard options for the key:

```text
sessionId : durableActualRevision : durableRescueRevision
```

Every physical confirmation invalidates the old authorization. Late responses are ignored unless all three identifiers still match.

### 4. Accepted unchanged result was not a durable decision authority

The server event vocabulary and persistence constraint now include `deviation_decision_accepted`. The client restores this receipt after reload, and completion treats it as the resolved state for the matching revision. The final lower-score modal provides a second explicit receipt before completion.

### 5. Historical enlargement concern

The shared formulation engine was not recalibrated. The Production adapter was audited with the exact Cream `320 g` / Dextrose `59.5 g` case and regression tests now prove that confirmed values are passed as lower bounds and that an already-confirmed ingredient may receive a positive `add` instruction. The OPTIMAL owner fixture produces an enlargement candidate without subtracting either confirmed amount.

In the served ECO recipe, the server truthfully reported no safe larger vector for the tested physical state. This is a formulation-strategy outcome, not a blanket “confirmed lines are locked forever” failure. The UI exposes that exact unavailability before selection.

### 6. Stale Topping behavior incorrectly blocked a Base-only decision

Served staging scenario B first failed even though the Base `leave_as_is` result was hard-safe. The canonical server error was a stale ProductBehavior snapshot on the later POST_PROCESS_ADDON topping. Production Rescue changes only Base, but the behavior gate evaluated the untouched topping too.

Migration `20260825220000_production_rescue_base_behavior_scope.sql` adds a fail-closed Base-scoped authority helper and patches both authorization and atomic apply functions. The frozen topping payload remains byte-preserved and is still checked during apply; it simply cannot block an unrelated Base-only decision.

### 7. The same stale Topping snapshot returned during completion

After a Base-only decision, hydration copied the complete Rescue behavior map over the exact current composition, resurrecting the old topping snapshot. Completion then failed locally before the completion RPC. Hydration now takes server-frozen authority for Base and Rescue-added lines, while the exact recipe composition remains authoritative for POST_PROCESS_ADDON lines. The previously blocked +2 g batch then completed durably as `1029 g` including the `27 g` topping.

### 8. Completed stale sessions had a dead-end and could be relabeled

Recovery previously hydrated an older durable run using the currently viewed recipe source. A completed session could therefore lose its immutable version identity, and the already-built archive dialog was unreachable from the real hook path.

Repairs:

- stale detection now includes recipe-version identity, not only content fingerprint;
- recovery never hydrates a durable run into a different recipe version;
- completed stale sessions use the custom archive dialog;
- completed history is detached locally and is never transitioned to cancelled or rewritten.

### 9. Audit constraint migration interaction

The decision-audit migration was updated to retain the already accepted `degassing_acknowledged` event while adding `deviation_decision_accepted`. This prevents a later migration from silently narrowing the event vocabulary.

### 10. Full-suite integration gates found a legacy restore regression and stale bundle

The first complete repository run found that the newly integrated non-transactional recipe-restore fallback could append a legacy snapshot with `NULL` product identity, while the atomic RPC path derived that identity correctly. It also found that the committed Production Rescue bundle no longer matched its declared 59-file source closure. The canonical staging repair now injects `versionIdentityFromInput(target.recipeInput)` into the fallback `buildRecipeVersion` call, and the trusted bundle was regenerated. The recipe-save contract, bundle contract, focused Production suite, build, and exact-head full suite all pass afterward.

### 11. Late Product Recognition integration introduced a lint-blocking escape

Three concurrent Product Recognition commits added a dosage-normalization character class with an unnecessary escaped hyphen. Runtime tests passed, but the repository lint gate correctly failed at `productRecognition.ts:450`. Moving the hyphen to the safe terminal position removed only the redundant escape; 35 focused recognition tests, the combined 100-test integration set, typecheck, lint, build, audits, and the complete suite pass afterward.

## Served-browser scenarios

The tests used the real signed-in PRO staging application and staging Supabase data.

| Scenario | Served result |
|---|---|
| A — exact | Six Base lines confirmed as `DODANO`, every deviation `0 g`, score 10, no decision panel, topping confirmed, durable completion succeeded. |
| B — Cream 318 → 320 early | Draft first showed `DO POTWIERDZENIA`; after confirmation the same row showed `DODANO` plus `+2 g ponad plan`. All three choices auto-evaluated. ECO preserve/enlarge were disabled with reasons; hard-safe unchanged 10 → 10 was accepted and completed without reload. |
| C — Cream 320 + Dextrose 59.5 | At 6/6 the vessel showed `1015.5 g`, target `1000 g`, `Ponad plan +15.5 g`. Preserve was disabled because the physical vessel already exceeded target; enlargement was attempted and unavailable with its reason; unchanged forecast showed 10 → 8 and was disabled as unsafe for that state. |
| D — Dextrose 0 | Before confirmation: `W naczyniu: 59.5 g`, draft `0.0 g`, `DO POTWIERDZENIA`, `−46 g poniżej planu`; physical mass did not change. After explicit correction: `DODANO`, `0.0 g`, vessel `957 g`, score 6, unsafe unchanged disabled. |
| E — mistaken entry | Custom modal showed Dextrose `59.5 g → 0 g`, consequence copy, `Anuluj` and `Popraw błędny wpis`; no native dialog. Vessel changed only after explicit confirmation. |
| F — add after confirmation | Cream `320 g` opened `Dodaj kolejną ilość`; the modal showed current `320 g`, additional `1 g`, result `321 g`. Durable audit recorded `top_up`, previous `320`, actual `321`; nothing was subtracted. Automated enlargement coverage also proves positive additions may target confirmed lines. |
| G — accept lower score | With Dextrose `30 g` and Cream `321 g`, current vessel `987 g` and hard-safe score 8. `Kontynuuj bez korekty` was recommended/selected, accepted durably as `8/10`, panel resolved without refresh, and final custom modal showed planned 10 → current 8. Explicit `Zakończ z wynikiem 8` completed the batch at `1014 g` including topping. |
| H — unsafe unchanged | Both the `1015.5 g` overshoot state and the confirmed-zero state disabled unchanged with `obecna partia nie mieści się w bezpiecznym zakresie`; no active-looking unsafe CTA remained. |

Browser diagnostics after the full sequence: no Runtime console/error/log events, no JavaScript native dialog, and no page reload required to resolve an accepted decision.

## Visual evidence

- `docs/evidence/production-flow-ux/01-desktop-zero-deviation.png`
- `docs/evidence/production-flow-ux/02-desktop-small-overage-decisions.png`
- `docs/evidence/production-flow-ux/03-desktop-hard-safe-score-8.png`
- `docs/evidence/production-flow-ux/04-mobile-final-score-confirmation.png`
- `docs/evidence/production-flow-ux/05-mobile-lower-score-dialog.png`
- `docs/evidence/production-flow-ux/06-tablet-accepted-score-8.png`

Desktop shows the five stable columns and decision hierarchy. Mobile turns Production into a focused sheet with a persistent compact status summary and a bottom-sheet final confirmation. Tablet keeps the score/accepted state, topping stage and final CTA readable without introducing a second decision system.

## Automated tests

Focused regression coverage added or expanded for:

- line draft/physical/correction/top-up state;
- exact, small-overage, large-overage, zero, positive-addition and impossible states;
- automatic three-option evaluation, selection, recommendation and stale-response invalidation;
- durable decision-event hydration;
- Base-only behavior-authority migration;
- stale Topping completion hydration;
- custom mistaken-entry, archive and lower-score completion dialogs;
- completed stale-session version binding and local archival;
- wide/tablet/mobile Production structure and copy.

Exact focused commands executed:

```bash
npm test -- --run src/features/production-workspace/productionSession.test.ts src/features/production-workspace/productionRescue.test.ts src/features/production-workspace/productionRescueBehaviorScope.migration.test.ts --reporter=dot --silent
npm test -- --run src/features/production-workspace/productionSession.test.ts src/features/production-workspace/productionRescue.test.ts src/features/production-workspace/productionRescueBehaviorScope.migration.test.ts src/features/pro-core/ProRecalcPanel.terminal.test.tsx src/services/proCore/supabaseRecipes.test.ts --reporter=dot --silent
npm test -- --run src/features/production-workspace/useProductionWorkspace.runtime.test.tsx src/features/production-workspace/ProductionCockpit.runtime.test.tsx src/features/production-workspace/productionWorkspaceUi.test.tsx --reporter=dot --silent
npm test -- --run src/features/production-workspace/useProductionWorkspace.runtime.test.tsx --reporter=dot --silent
```

Focused results: `3/3 files, 41/41 tests`; `5/5 files, 82/82 tests`; `3/3 files, 40/40 tests`; final hook boundary `1/1 file, 9/9 tests`.

Exact integrated-head contract command:

```bash
npm test -- --run src/services/proCore/recipeSaveContract.test.ts src/features/production-workspace/productionRescueEdgeBundle.test.ts src/features/production-workspace/useProductionWorkspace.runtime.test.tsx src/features/production-workspace/ProductionCockpit.runtime.test.tsx src/features/production-workspace/productionWorkspaceUi.test.tsx --reporter=dot --silent
```

Result: `5/5 files, 65/65 tests`.

Late-integration commands:

```bash
npm test -- --run src/features/product-intelligence/productBehaviorAuthority.test.ts src/features/product-intelligence/productRecognition.test.ts src/features/product-intelligence/productRecognitionV2.migration.test.ts src/services/proCore/recipeSaveContract.test.ts src/features/production-workspace/productionRescueEdgeBundle.test.ts src/features/production-workspace/useProductionWorkspace.runtime.test.tsx src/features/production-workspace/ProductionCockpit.runtime.test.tsx src/features/production-workspace/productionWorkspaceUi.test.tsx --reporter=dot --silent
npm test -- --run src/features/product-intelligence/productRecognition.test.ts src/features/product-intelligence/productBehaviorAuthority.test.ts src/features/product-intelligence/productRecognitionV2.migration.test.ts --reporter=dot --silent
```

Results: `8/8 files, 100/100 tests` before the syntax-only lint repair; `3/3 files, 35/35 tests` after it.

Final gates executed after the last runtime change:

```bash
npm test -- --run --reporter=dot --silent --maxWorkers=1
npm run typecheck
npm run lint
npm run build
npm run production-rescue:bundle-check
npm run products:audit
npm run mapper:runtime-audit
npm run catalog:mapper-only:validate
npm run recipes:validate
npm run process:validate
npm run toolbox:compositions:check
```

Final exact-head result on runtime-equivalent `d913b7f`: `730/730` executed test files passed with `2` additional skipped files; `8,983/8,983` executed tests passed with `101` additional skipped tests; zero failures; duration `544.20 s`. The single-worker setting preserves every original test timeout while preventing cross-file CPU contention in the solver-heavy cases. One of the skipped files is the new live-only Product Recognition proof, which was not run against external services during this staging-safe repository gate. The tested `d3e07b2` and canonical `d913b7f` runtime trees are byte-identical across `src`, `supabase`, and package manifests.

The gate history is intentionally retained:

- the first unbounded full run exposed two deterministic integration defects (legacy restore identity and stale generated bundle) plus one 120-second solver timeout;
- after those deterministic repairs, a four-worker run passed `8,943` tests but one unrelated Horchata case exceeded its 5-second budget; the exact case passed alone in `4.15 s`;
- the unchanged full suite passed with one worker, and was repeated after concurrent staging integration; the exact final head passed with the counts above;
- the last concurrent Product Recognition integration initially produced `1` lint error; the syntax-only correction is covered by `35/35` focused recognition tests and the exact final full suite;
- `Error: failed to load ./ita.special-words` is output from an exercised error-path test; the runner continued and exited `0`;
- lint: `0` errors and `4` pre-existing Fast Refresh warnings;
- build: passed (`1,273` modules transformed) with the existing chunk-size advisory;
- every listed product/Mapper/recipe/process/toolbox audit passed; Mapper remained `2,088` rows with SHA-256 `b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38`.

Exact diagnostic/rerun commands used during that gate history:

```bash
npm test -- --run --reporter=dot --silent
npm test -- --run src/services/proCore/recipeSaveContract.test.ts --reporter=dot --silent
npm test -- --run src/features/production-workspace/productionRescueEdgeBundle.test.ts --reporter=dot --silent
npm test -- --run src/features/constraint-studio/mainConstrainedNearestAndRescue.test.ts -t "13. rescue never auto-adds" --reporter=dot --silent
npm test -- --run --reporter=dot --silent --maxWorkers=4
npm test -- --run src/features/constraint-studio/recipeVectorProximity.test.ts -t "keeps Cinnamon near 2 g or proves the exact Horchata target needs movement \\(-11 °C, sweetness -2, hardness -2\\)" --reporter=verbose --silent
npm test -- --run --reporter=dot --silent --maxWorkers=1
```

## Deployment identity

Served-browser scenario deployment for `368fc3e9d28378a8b0f457a4cead6df8985f7830`:

- Vercel project: `pinguino-staging`;
- staging alias: <https://staging.pinguinoai.com>;
- deployment ID: `dpl_5EeK5k9kWTb9tnxFJec6SVkgMwmS`;
- immutable URL: <https://pinguino-staging-nxh1p3mnj-pinguinointelligence-7784s-projects.vercel.app>;
- status: `READY`.

Staging backend:

- migration `20260825090000_production_deviation_decision_audit.sql` applied and recorded;
- migration `20260825220000_production_rescue_base_behavior_scope.sql` applied and recorded;
- `production-rescue-authorize` ACTIVE, staging version 15;
- generated trusted bundle hash: `2643bdac81e311c3448ba7b3e2ef10fcd032c4f191d073a9f8275a3379f336be`;
- anonymous/authenticated direct EXECUTE remains revoked on the internal Base-scope helper.

The Vercel deployment uses its separate `pinguino-staging` project. Vercel labels that project's deployment target `production`, but this is the staging project/alias; the PINGÜINO production project and production Supabase project were not deployed or modified.

## Completion ledger

1. **Requested scope:** audit and repair the complete Production physical flow, correction decisions, batch recovery, tests, staging deployment, and served-browser QA.
2. **Completed work:** physical/difference separation; table and instruction hierarchy; custom correction/top-up/archive/final dialogs; truthful mass/score; automatic three-choice decisions; durable unchanged acceptance; stale-state and stale-topping repairs; responsive QA.
3. **Files changed:** Production row/table/cockpit/session/hook/store/contracts and tests; trusted Rescue bundle metadata; two staging SQL migrations; this report and six evidence screenshots. Concurrent staging work in `ProRecalcPanel`, recipe restore, Product Recognition, and monitor/topping UI was integrated and gated but is separately authored.
4. **Tests added or changed:** Production session, Rescue, workspace UI/runtime, decision migration, Base-scope migration, session-store, ingredient-table and final-workbench design coverage; existing recipe-save and bundle contracts caught the late integration regressions.
5. **Exact test commands:** listed in **Automated tests**.
6. **Test results:** all focused suites green; exact integrated head `730` files and `8,983` tests passed, `2` files and `101` tests skipped, zero failures; typecheck/build/bundle/audits passed; lint `0` errors and `4` existing warnings.
7. **Previously accepted flows retested:** exact Production, topping stage, atomic completion, heat information, degassing event vocabulary, recipe-version recovery, six canonical serving/machine choices, Demo gram hiding/Home+Pro exact grams through the full repository suite.
8. **Deployment environment verified:** Vercel `pinguino-staging`, Supabase `tunabqqrwabacxjcxxkz`, alias `staging.pinguinoai.com`; production project/ref untouched.
9. **Remaining incomplete items:** none in requested Production scope. ECO may honestly have no feasible preserve/enlarge candidate for a given physical state; the UI now reports that constraint instead of inventing a plan. The four lint warnings and build chunk advisory are pre-existing, non-blocking maintenance items.
10. **Blockers/external actions:** none. No production deployment was requested or performed.
11. **Git diff and commit status:** served Production repair is committed through `368fc3e`; final integrated/gated staging runtime is canonical `d913b7f` (runtime-tree equivalent to tested `d3e07b2`); report/screenshots are committed, with this final identity/count update prepared as a documentation follow-up. The four dry-run JSON files written by the full suite were later accepted by the canonical recognition baseline commit `7c48b32`. `node_modules` is an untracked worktree symlink and will not be committed.

**STAGING DEPLOYED AND TESTED.**

**PRODUCTION WAS NOT DEPLOYED.**
