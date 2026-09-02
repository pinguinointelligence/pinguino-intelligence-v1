# MULTI-REMOVE / NO-REFRESH LEDGER — Agent C (owner FINAL INTEGRATION ADDENDUM, item 6)

**Branch** `agent-c/multi-remove-norefresh` · **base** `fb2924f` (= staging, nightly/integration)
**Owner instruction (binding):** *„Reproduce the exact remaining live failure: remove several
ingredients, immediately click Przelicz z PI, compare with refresh. Do NOT close the refresh defect
using only the separate Inulin fixture."*

**VERDICT — the owner's multi-remove flow works WITHOUT a refresh.** The literal
remove→remove→remove→edit→recalc sequence already produced a byte-identical canonical payload and a
genuinely usable proposal both live and refreshed; Agent R's FINAL CLOSURE fix holds on the owner's
real sequence, not only on its own fixture. Two *adjacent branches of the same flow* were still
asymmetric — an explicit „Niedostępny" and a §17 padlock each silently changed meaning across F5 —
and both are now fixed and pinned.

---

## 1. The literal sequence (owner item 6.1)

Built over the **real stores**, no store mocks, no UI wrapper, no async effect, no timeout:
`src/features/constraint-studio/ownerMultiRemoveNoRefresh.test.ts`.

| # | Step | Real entry point |
|---|---|---|
| 1 | Open the SAVED recipe „Gelato mleczne" (v4, aggregate `r-owner-multi-remove`) | `useRecipeStore.loadRecipeInput(input, link)` — the path `MyRecipesPage.onOpen` uses |
| 2 | Remove **Cream** | `removeItem('milk-base:cream_30')` |
| 3 | Remove **SMP** | `removeItem('milk-base:smp')` |
| 4 | Remove **Dextrose** | `removeItem('milk-base:dextrose')` |
| 5 | Edit one more ingredient's grams (Sucrose 130 → 140 g) | `setPlannedGrams('milk-base:sucrose', 140)` |
| 6 | **Immediately** click „Przelicz z PI" | `useConstraintStudioStore.createOptimizePreview()` — the exact call `ProWorkspacePage.startRecalc` makes (`src/pages/pro/ProWorkspacePage.tsx:114`) |

The fixture is a **complete milk gelato that really contains Cream, SMP and Dextrose**, with the
stable `<preset>:<ingredient>` line ids a saved `recipe_input` really carries. Removing those three
strips the dairy-fat, milk-solids and sugar-freezing-control carriers at once — the case Agent R's
fruit fixture (which kept strawberries as bulk) did not exercise.

## 2. The captured payload at the moment of the click (owner item 6.2)

`capturePayload()` records everything the owner enumerated, split into the **formulation-material**
half (a reload must reproduce it byte-for-byte) and **session metadata** (a reload legitimately
resets it).

```
MATERIAL
  lines                    [["milk-base:milk_3_5","milk_3_5",670,null,"unlocked"],
                            ["milk-base:sucrose","sucrose",140,null,"unlocked"],
                            ["milk-base:tara_gum","tara_gum",5,null,"unlocked"]]
  pipelineLines            same three ids/grams/locks as seen through buildRecipeInput
  constraintsByLineId      {}                     ← no orphan §17 entry
  exclusions               []                     ← removal is NOT exclusion (C2)
  unavailableIngredientIds []
  removedLineIds           ["milk-base:cream_30","milk-base:smp","milk-base:dextrose"]
  roleMappings             3 rows, rebuilt from the CURRENT lines only
  targetBatchGrams         1000
  currentTotalGrams        815
  visibleProductType       gelato
  internalCategory         milk_gelato            ← internal profile
  tier / temperatureC      classic / −11
  machine                  kind null, capacity null, source null, effective null
  savedRecipe              id r-owner-multi-remove, name „Gelato mleczne", v4, 2026-07-20
  stagedPreviewKind        null                   ← nothing stale survived the edits
  stagedPreviewIssueCode   null
SESSION META
  draftRevision 5 · draftContextSeq 1 · dirty true · applyHistoryLength 0
```

**Outcome of the immediate click — genuinely usable, not a stale/missing-role/orphan refusal:**

```
previewIssue  null
kind          optimize     total 1000.00 g (batch equality holds)
proposal      milk-base:milk_3_5   milk_3_5  676.38
              milk-base:sucrose    sucrose   108.05
              milk-base:tara_gum   tara_gum    5.05
              correction-dextrose-0  dextrose   40.92   ← HARD role refilled…
              correction-cream_30-0  cream_30  130.99
              correction-smp-0       smp        38.62
```

The three vacated roles are refilled (removal is not exclusion), each under a **new line identity** —
never by resurrecting `milk-base:cream_30 / :smp / :dextrose` — and with no duplicate canonical
ingredient.

## 3. Live click vs post-refresh click, field by field (owner item 6.3)

`simulateReload()` rebuilds the stores the way a page reload does and **respects the partialize**:
it keeps exactly what each store's `partialize` writes, resets everything else to its initial value,
and merges the persisted slice back (including the constraint store's reconciling `merge`). It never
reaches around the contract — if a material field leaves the partialize, the helper drops it and the
comparison fails naming that field.

### Result on the literal sequence

**Byte-identical.** `firstDifferingField(live.material, refreshed.material) === null`, and the
identical click on both sides yields the identical projected result (kind, base fingerprint, role
trace, every proposed line, total). Only `draftRevision 5 → 0` and `draftContextSeq 1 → 0` reset,
which `canonicalDraftSerialization` already documents as non-material.

### Result on the adjacent branches — TWO first differing fields, both real

Verified by patching the fix out and re-running (6 of 15 tests fail; the literal-sequence tests keep
passing, which is what proves the defect was *adjacent to*, not *inside*, the owner's literal flow):

| Branch of the flow | First differing field | live | refreshed |
|---|---|---|---|
| mark Cream „Niedostępny", then remove SMP + Dextrose, edit grams | **`exclusions`** | `["cream_30"]` | `[]` |
| padlock Sucrose @130 g, then remove Cream + SMP + Dextrose, edit grams | **`constraintsByLineId`** | `{"milk-base:sucrose":{"mode":"locked","grams":130}}` | `{}` |

## 4. Root cause and fix

**Root cause — the persistence contract did not cover the canonical draft.**
`canonicalDraftSerialization` declares eight fields FORMULATION-MATERIAL (items, `byLineId`,
exclusions, batch, category, temperature, tier, machine capacity). **Two of the eight were not
persisted**, so a reload and a live session could formulate from different inputs — the exact defect
class the owner has been chasing:

1. **`exclusions`.** Agent R's ledger correctly identified that *„a refresh worked because
   `excludedIngredientIds` is NOT in the persist partialize"* — but the fix removed one **writer**
   (`removeItem`) rather than sealing the **leak**. `markIngredientUnavailable` still wrote to an
   unpersisted field, so the owner-frozen guarantee *„an explicitly unavailable ingredient never
   returns"* was true only until the next F5.
2. **`byLineId`.** A §17 padlock writes **both halves of one lock**: the exact grams into the
   constraint store *and* `lock_type: 'grams'` onto the recipe line. The recipe line was persisted,
   the constraint was not — so a reloaded draft stayed engine-frozen with no padlock to show for it,
   and the two payloads disagreed.

**Fix (only in the two stores Agent C owns):**

- `src/stores/recipeStore.ts` — `excludedIngredientIds` joins `recipePersistPartialize`. The
  draft-scoped lifecycle is unchanged, so a persisted exclusion is always recoverable: load / preset
  / reset clear it, emptying the draft clears it, and an explicit re-add lifts it.
- `src/features/constraint-studio/constraintStudioStore.ts` — a new
  `constraintStudioPersistPartialize` persists **the constraint set and nothing else**. `preview`,
  `previewIssue`, `blocked`, `feasibility` and `history` stay working memory on purpose: a rehydrated
  preview would be stale by construction (its `baseDraftRevision` belongs to a dead session), and §20
  undo restores a byte-exact in-memory snapshot whose durable equivalent is the save→version path.
  Rehydration is **reconciled, never trusted** (`merge`), so an entry survives only while its line
  still exists *and* still carries the engine lock.

Not changed, deliberately: `draftRevision` / `draftContextSeq` (a fresh session must start at 0 or
the monotonic staleness guard would inherit a dead session's counter) and the §20 history.

## 5. Endurance — 20 no-refresh cycles (owner item 6.5)

One draft, **no reload anywhere**, 20 cycles each mixing: edit grams · remove · add back · set 0 g ·
mark unavailable · re-add · §17 lock · §17 unlock · recalculate · apply-or-cancel (alternating).
Asserted **after every cycle**:

| Invariant | Result |
|---|---|
| (a) no stale constraints — every §17 entry points at a live line | held ×20 |
| (b) no stale exclusions — excluded and present are mutually exclusive | held ×20 |
| (c) no duplicate canonical ingredients | held ×20 |
| (d1) no removed **user** line identity ever returns | held ×20 |
| (d2) no line id ever changes which ingredient it stands for | held ×20 |
| (e) target batch stays 1000 g | held ×20 |
| (f) no staged preview dangles across a cycle boundary | held ×20 |
| (g) identical canonical input → identical result (run twice) | identical |
| (h) a reload *after* the 20 cycles still agrees, and re-running the click still matches | identical |

**A finding worth recording (d1 vs d2).** The first draft of invariant (d) — *no removed line id ever
returns* — failed at cycle 6 on `formulation-cream_30`. That is **not** a stale role mapping: toolbox
lines the pipeline adds carry a deterministic `formulation-<ingredient>` id, so refilling the same
role later legitimately reuses it. The guarantee the owner actually needs was therefore split: a
removed **user** identity may never come back (d1), and **no** id may ever come back wearing a
different canonical ingredient (d2) — which is the real „wrong role restoration" protection and is
strictly stronger than the original phrasing for pipeline-generated lines.

## 6. The three zero/removal states, WITHOUT a refresh (owner item 6.6)

On the immediate click, no reload anywhere:

| State | Set up by | Result |
|---|---|---|
| selected-unlocked **0 g** — fillable | `setPlannedGrams(sucrose, 0)` | refilled, `> 0 g` |
| exact-locked **0** — deliberate zero | `setPlannedGrams(tara, 0)` + §17 padlock | stays exactly `0` (`Object.is`) |
| **explicitly unavailable** | `markIngredientUnavailable(cream)` | never returns to the proposal |

All three are re-asserted **after a reload** as well — previously the padlocked zero and the
exclusion both changed meaning across F5.

## 7. Frozen invariants re-checked

8 × 125 g rejection · `beatsBaseline` · `isBatchReconciliation`'s five discriminators · locks
byte-exact (`Object.is`, re-pinned across rehydration) · batch equality · no duplicate canonical
ingredients · exclusions never reintroduced · removal-is-not-exclusion · the single `VerifiedApply`
door (boundary guard still passes: the studio store keeps exactly one direct recipe write) ·
`draftRevision` / `draftContextSeq` invalidation · zero-gram selected semantics · one-screen
workbench. **No pinned expectation needed to change**, so no supersession comment was required.

## 8. Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | clean |
| `npx eslint .` | **0 errors**, 2 pre-existing `react-refresh` warnings (expected) |
| `npx vitest run` | **386 files / 5237 tests, all green** (baseline 385 / 5222 → +1 file, +15 tests, **none lost**) |
| `npm run build` | green |

## 9. Note for the Integration Owner — worktree hygiene

This work started in the shared repository root, where **Agent A was concurrently editing**
`templateRegistry.ts`, `buildRecipeInput.ts` and `productType.ts`. A baseline `git stash` there
captured Agent A's in-flight files along with mine; they were **restored immediately and verified**
(`git status` clean of my work, Agent A's modifications intact), and Agent C moved to an isolated
worktree at `.claude/worktrees/agent-c` for the rest of the run. A full-suite run in the shared root
showed 12 unrelated failures caused by Agent A's mid-edit state; the same suite in the isolated
worktree is **385/5222 green at `fb2924f`**, which is the baseline this ledger measures against.
