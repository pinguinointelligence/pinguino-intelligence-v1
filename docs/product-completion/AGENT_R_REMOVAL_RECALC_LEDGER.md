# AGENT R — REMOVAL / LIVE RECALCULATION LEDGER (OWNER FINAL CLOSURE)

Date: 2026-07-24 · Branch: `agentr/removal-recalc` (base `a55f5fc` = nightly/integration = staging)

Owner bug (live): open saved recipe → remove Cream → remove SMP → remove Dextrose →
edit another value → immediate „Przelicz z PI" fails (or follows an earlier state);
after F5 the SAME visible draft calculates.

---

## C1 — Deterministic reproduction + FIRST DIFFERING FIELD

Reproduced pre-fix (worktree at `a55f5fc`, before any change) with the exact owner
sequence through the real store actions (`loadRecipeInput` → `removeItem('l-cream')`
→ `removeItem('l-smp')` → `removeItem('l-dex')` → `setPlannedGrams('l-milk', 400)`
→ `createOptimizePreview()`), fixture = the owner's complete Fruit Gelato
(Strawberry 350 / Milk 380 / Cream 80 / SMP 40 / Sucrose 110 / Dextrose 35 /
Tara 5, −11 °C, 1000 g).

Captured pre-fix evidence (vitest run, deterministic):

1. **State after the removals**:
   `excludedIngredientIds = ["cream_30","smp","dextrose"]` — every `removeItem`
   silently added the removed ingredient to the exclusion list.
2. **Immediate „Przelicz z PI" (constrained variant — a §17 padlock present, the
   canonical template route)**:
   ```
   previewIssue = { code: "missing_required_role", role: "sugar_freezing_control",
     messagePl: "Brakuje składnika w twardej roli technologicznej:
                 sugar_freezing_control. Dodaj zatwierdzony składnik tej roli,
                 aby PI mogło ułożyć recepturę." }
   preview = NULL
   ```
   Dextrose (the only approved `sugar_freezing_control` toolbox candidate) was
   excluded by its own removal → the toolbox refused the refill → hard-role stop.
3. **Pre/post-refresh canonical serialization** (`canonicalDraftSerialization`,
   field order: items → byLineId → exclusions → batch → category → temperature →
   tier → machineCapacity):
   ```
   first differing field: exclusions
     live      = ["cream_30","smp","dextrose"]
     refreshed = []
   ```
   `excludedIngredientIds` is intentionally NOT in `recipePersistPartialize`
   (draft-scoped session state), so F5 silently dropped the exclusions and the
   same visible draft calculated — exactly the owner's symptom.
   `byLineId` did NOT differ at the canonical-selector level (read-time
   `reconcileConstraints` pruned orphans), but the RAW session store kept the
   removed line's entry pre-fix (`{ mode:'locked', grams:80 }` for a removed
   `l-cream` survived until the next lazy `reconcile()` — the write-time orphan
   verified by the C3 test).

**Root cause (confirmed prime hypothesis):** the REMOVAL-AS-EXCLUSION contract
(`removeItem` → `excludedIngredientIds`) collided with recalculation, and the
exclusion half of the draft was invisible (not persisted, not shown), so the
"same" visible draft was NOT the same formulation input before vs after refresh.

## C2 — Removal semantics (owner-binding; SUPERSEDED PIN)

New contract (implemented in `src/stores/recipeStore.ts`):

- **„Remove row" (`removeItem`)** = removed from the CURRENT recipe, nothing
  else: no orphan §17 constraint (bridge, see C3), no unavailable flag, no
  stale role mapping (roles derive from current items only), no staged
  preview/added[] leftovers (revision invalidation), and **NEVER a scientific
  exclusion** — the toolbox may refill the vacated role.
- **The EXPLICIT „unavailable/exclude" action (`markIngredientUnavailable`)**
  is the ONLY exclusion source: removes every line of the canonical ingredient
  AND records the exclusion. New UI affordance: „Niedostępny" button per row
  (`IngredientRow` / `IngredientBuilder`), ADD-only copy keys
  `studio.builder.markUnavailable` / `markUnavailableTitle` in `src/copy/en.ts`.
- **Distinct states kept distinct** (pinned by test): selected-unlocked-0 g
  (fillable) ≠ exact-locked-0 (§17 padlock — stays zero) ≠ EXPLICIT
  unavailable/excluded (never reintroduced).

**Superseded-pin justification:** the NIGHTLY-phase rule „removal DOES exclude"
(pinned in `nightlyP0.test.ts` „same-draft removals still exclude honestly",
`liveRuntime.test.ts` exclusion block, `constrainedReformulation.test.ts`
FIXTURE D step 2) was the direct cause of the owner's live failure — owner
FINAL CLOSURE C2 supersedes it. Tests updated DELIBERATELY with supersession
comments at each site. **Frozen pins kept unchanged:** Undo restores exclusion
state with the snapshot (FIXTURE D still passes — the exclusion is now
established via the explicit action); an EXPLICIT exclusion is never
reintroduced by the toolbox; an explicit add clears the exclusion; the
draft-scoped lifecycle stays (empty draft / load / preset / reset ⇒ fresh
exclusion context — FAILURE B test 10 unchanged).

## C3 — ONE atomic material-edit transaction

Every material edit is one synchronous transaction; no async effect, no timeout:

1. `removeItem` / `markIngredientUnavailable` / every other recipe edit is a
   single zustand `set` on the canonical recipe store — items + derived
   category + exclusions + `dirty` + `draftRevision` bumped **EXACTLY once**.
2. The store bridge (`constraintStudioStore.ts`, bottom) runs SYNCHRONOUSLY
   inside that same `setState` (zustand subscribers are synchronous) and, on
   every revision bump: (a) reconciles the §17 constraint set against the
   CURRENT lines — entries for removed line ids are dropped at WRITE time, not
   only at read time; (b) invalidates staged preview/previewIssue/feasibility/
   blocked unless the staged preview carries the new revision. No extra bump.
3. Role-mapping inputs need no rebuild step: roles are derived per-call from
   the current items (`resolveFunctionalRole`), so a removed line can never
   contribute a stale role.
4. The double-write removal path was retired: `onLineRemoved` (which dropped
   the constraint AND bumped the revision a second time before `removeItem`
   bumped again) is deleted; `useLineLockControls.wrapActions` passes
   `removeItem` through untouched. One mechanism, one bump.

## C4 — Recalc click = ONE canonical immutable snapshot

`createOptimizePreview` (the workbar „Przelicz z PI") already composes the
draft via THE one selector (`selectCanonicalDraft`) — a single synchronous
snapshot of both stores; no mixed-moment reads. With C3 the snapshot is
guaranteed current the instant any edit returns, so the button needs no
disabled window: everything between click and preview is synchronous
(pinned by the C4 test: constraint entries always point at live lines, two
immediate snapshots serialize identically).

## C5 / owner F tests (10–15) — `src/features/constraint-studio/removalRecalc.test.ts`

| F | Test | Status |
|---|------|--------|
| 10 | removal clears orphan §17 constraints synchronously (raw store, one bump) | green |
| 11 | removal clears stale role mappings (refill under a NEW line id, never `l-dex`) | green |
| 12 | removal invalidates Preview/feasibility immediately | green |
| 13 | immediate recalc uses the CURRENT draft (owner sequence formulates, no refresh) | green |
| 14 | pre/post-refresh payloads IDENTICAL (field-by-field first-difference loop) + identical proposals | green |
| 15 | 20 no-refresh cycles (edit/remove/set-0/lock/unlock/recalc/apply-or-cancel): no stale constraints/exclusions, no duplicates, batch 1000, deterministic epilogue | green |

Plus: explicit-action semantics (removes + excludes), frozen never-reintroduce
pin on the canonical constrained route, explicit-add-clears, three-distinct-
states, draft-scoped lifecycle.

## Known gap flagged (OUT of Agent R scope)

The LOCAL-correction route (`applyPipeline.ts` — `buildOptimizePreview`'s
local branch / `iterateSolverToFixedPoint` → `proposeAutoFix` at line ~646)
does **not** thread `excludedIngredientIds` into the solver's ADD candidates:
a substantive unconstrained draft can still re-add an EXPLICITLY excluded
ingredient (violates the frozen never-reintroduce pin on that route only).
Pre-existing behavior, surfaced by the new explicit action; `applyPipeline`
solver internals are owned by the parallel addendum agent — flagged, not fixed
here. The formulation/constrained routes enforce the pin correctly.

## Gates

- `npx tsc --noEmit` — clean.
- `npm run lint` (`eslint .`) — 0 errors (2 pre-existing warnings in untouched
  files: `app/router.tsx`, `pro-core/RecipeVersionsSection.tsx`).
- `npm test` — FULL vitest green (see final message for counts).
- `npm run build` — green.

## Files changed

- `src/stores/recipeStore.ts` — C2 removal semantics + `markIngredientUnavailable` (the only exclusion source), C3 transaction docs.
- `src/features/constraint-studio/constraintStudioStore.ts` — bridge: write-time constraint reconciliation on every revision bump; `onLineRemoved` retired.
- `src/features/constraint-studio/useLineLockControls.ts` — removal wrapper removed (single-bump contract).
- `src/features/ingredient-builder/IngredientRow.tsx` / `IngredientBuilder.tsx` — explicit „Niedostępny" affordance (optional action).
- `src/copy/en.ts` — ADD-only keys `markUnavailable`, `markUnavailableTitle`.
- `src/features/formulation/nightlyP0.test.ts`, `liveRuntime.test.ts`, `constrainedReformulation.test.ts` — deliberate supersession updates (documented in-file).
- `src/features/constraint-studio/removalRecalc.test.ts` — NEW: owner F 10–15 + C1 instrument.
