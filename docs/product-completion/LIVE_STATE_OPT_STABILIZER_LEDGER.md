# LIVE STATE / OPTIMIZATION / STABILIZER — COMPLETION LEDGER (NIGHTLY P0, 2026-07-24)

Branch: `nightly/live-state-opt-stabilizer` (isolated worktree; **not** pushed to main/staging; no deploy; no staging-verification claim — the Integration Owner integrates, deploys and runs staging proof).
Base: `bac7f44` — nightly/integration including `fix(formulation): zero-gram selected-ingredient semantics`.
Final commit hash: the commit carrying this ledger (reported in the final message).
Science freeze respected: **no** TARGET_BANDS / ICE_ANCHOR / PAC / POD / Mapper-value / CONFIG_VERSION / ENGINE_VERSION change (engine 0.4.0 / config 0.7.0 pinned by test).

---

## 1. FAILURE 1 — STALE STATE (P0)

### 1.1 Deterministic repro + FIRST DIFFERING FIELD (Phase 1, captured on the PRE-FIX base)

Owner sequence automated (`src/features/constraint-studio/staleDraftState.test.ts`, the
serialization computed INLINE so the instrument is fix-independent): session draft → §17 padlock
on Milk @500 g → save → `loadRecipeInput(saved)` → set grams to 0 → compare the canonical
serialization (items / byLineId / exclusions / batch / category / temperature / tier / machine
capacity) LIVE vs after a SIMULATED REFRESH (persisted slice rehydrated; §17 store fresh).

Probe run against the stashed pre-fix sources (verbatim output):

```
FIRST DIFFERING FIELD: byLineId
  live      = {"line-mrz9uguq-0":{"mode":"locked","grams":500}}
  refreshed = {}
```

Every other field was byte-identical. **The §17 padlock from the EARLIER session draft survived
the saved-recipe load and silently constrained the reloaded draft; F5 wiped the non-persisted
store, which is why the same visible state formulated fine after refresh** — the owner's exact
"refuses or follows an EARLIER constraint state" behavior.

### 1.2 Root cause (Integration-Owner prime suspect CONFIRMED)

`constraintStudioStore` is a separate, non-persisted store; `loadRecipeInput` never touched it and
`reconcile()` only prunes constraints whose **line id no longer exists**. Saved recipes have
STABLE line ids, so `constraints.byLineId` entries from an earlier session survived reconcile
(line present, `lock_type === 'grams'`) and: (a) `routeFormulationMode` counted them as
`hardConstraints` → constrained reformulation / all-locked refusals; (b) `buildFormulationProposal`
pinned lines at the STALE `constraint.grams` (the earlier 500 g, not the visible 0 g);
(c) `isEffectivelyLockedLine` treated a visible 0 g line as HARD-locked because the stale entry
said `{mode:'locked'}`. Also audited: staged `preview`/`previewIssue` reuse (previously survived
edits until an Apply attempt — now invalidated instantly), undo history feasibility (fingerprint
guard was already sound; now also selector-fed), `excludedIngredientIds` (already draft-scoped —
carried by the selector, reset by loads), cached solver/template results (none exist outside the
staged preview; the template registry is static config).

### 1.3 The sync fix (Phases 2–3)

- **ONE canonical draft selector** — `selectCanonicalDraft()` (+ `canonicalDraftSerialization`)
  in `src/features/constraint-studio/constraintStudioStore.ts`: revision, contextSeq, engine
  `RecipeInput` (ids/grams/actuals/locks/batch/category/temperature/tier/machine capacity/goals),
  RECONCILED §17 constraints, exclusions/unavailable, machine context, saved-recipe link.
  Consumed by: Przelicz (`createOptimizePreview`), batch-rescale & suggested-fix previews, the
  Apply gate (`applyPreview` → `commitPreview`), Undo feasibility (`undoLastApply`),
  `runFeasibility`, §17 range validation, and the QA diagnostics tests. Recipe-ONLY readers
  (Monitor `useStudioResult`, ProRecalcPanel display) read the same single recipe store through
  the pure `buildRecipeInput` seam — they consume no constraints, so the FAILURE-1 drift class
  (recipe half vs constraint half) cannot reach them; every constraint-aware consumer goes
  through the selector.
- **Monotonic `draftRevision`** (`src/stores/recipeStore.ts`, not persisted): incremented on EVERY
  material edit — gram, add/remove, lock change, §17 constraint/range change (via
  `bumpDraftRevision` from the studio store), exclusion, product type, tier/mode, temperature,
  serving mode, batch, machine capacity/selection, apply (and its rollback), undo restore, load.
- **`draftContextSeq`**: bumps ONLY on `loadRecipeInput` / `loadPreset` / `resetToDemo`.
- **Store bridge** (in the STORE layer, no UI file touched): a `useRecipeStore.subscribe` at the
  bottom of `constraintStudioStore.ts` — contextSeq change → `resetDraftSession()` (constraints,
  staged preview/issue/feasibility/blocked AND §20 history cleared: **a loaded recipe starts a
  fresh §17 context**); revision change → staged state built for the old draft invalidated
  instantly.
- **Stale-Apply guard**: previews carry `baseDraftRevision`; `commitPreview` rejects a revision
  mismatch (`stale_preview`) IN ADDITION to the kept fingerprint guard. The edit-and-edit-back
  case (fingerprint returns to base, revision advanced) is caught ONLY by the revision guard —
  pinned by test.

### 1.4 Phase 4 — zero-gram semantics without refresh

All three owner states re-proven through the LIVE stores with a poisoned earlier-session §17
state and NO refresh (`staleDraftState.test.ts` tests 6–8): artifact-locked 0 g fruit fills
(gelato), sorbet fills without dairy, an EXPLICIT §17 zero set after the load stays 0 g with the
honest note. The original pinned `zeroGramSemantics.test.ts` suite stays green and untouched.

---

## 2. FAILURE 2 — OPTIMIZATION STOPS EARLY

### 2.1 Old vs new stopping behavior

| | pre-fix | post-fix |
|---|---|---|
| Formulation path (template-seeded) | hard cap **2** rounds, no improvement check per round, no stop reason | shared `iterateSolverToFixedPoint`, cap **12** |
| Local-correction path | cap 4 rounds, kept non-improving rounds, `violated` only on no-proposal | same shared iterator, cap **12** |
| Stop conditions | rounds exhausted OR solver silent (one bucket) | `all_bands_in_range` (10/10) · `fixed_point_no_proposal` with detail `solver_fixed_point` / `missing_candidate` / `apply_failed` / `provisional_band_conflict` · `no_improving_move` (a produced move that verifiably improved nothing is REVERTED — the verified fixed point) · `iteration_cap` (deterministic, REPORTED via `capped: true`) |
| Diagnostics | `solverRounds` count only | `IterationDiagnostics`: invocation count, per-round violation/severity trajectory (round 0 = start), stop reason + detail, capped flag — on the preview AND on `no_proposal` / `unsafe_proposal` / `best_safe_result` failures, surfaced in the Owner/QA panel (`Iteracje optymalizatora`, `Trajektoria naruszeń`, `Kod zatrzymania`) |

Per-round acceptance is **engine-verified**: a round is kept only if, after the canonical-identity
merge + batch restoration, violations strictly drop or the engine's own weighted severity strictly
drops. Determinism: the engine solver is deterministic and the loop adds no randomness — pinned by
a 5-run byte-identity test. Beat-the-null for unconstrained NATIVE profiles unchanged (pinned).

### 2.2 Native multi-round proof (B3 owner dairy fixture, milk_gelato −11 = its own seeded band)

```
rounds: 0: violations 3, severity 1.0854   (pod low, npac high, ice low)
        1: violations 2, severity 0.9524
        2: violations 2, severity 0.1929
        3: violations 0, severity 0
stopReason: all_bands_in_range · capped: false · solverInvocations: 3
```

Three rounds to 10/10 — the pre-fix formulation cap (2) could not have reached this on the
seeded path, and the one-line „(1 runda)" presentation is now backed by the real per-round record
(the copy already rendered the true round count; it now has the full trajectory behind it).

### 2.3 Provisional profiles (fruit_gelato)

Fallback bands GUIDE the iteration exactly like native bands (`detectViolations` on the engine's
own fallback classification); the score labelling „Ocena częściowa / prowizoryczna" and the
`reference_derived` template note are UNCHANGED (kept, pinned). The reference-template fixture
terminates as the explanatory `best_safe_result` with `stopDetail: provisional_band_conflict` —
never a bare 1-round rejection, and never presented as a validated 10/10.

---

## 3. FAILURE 3 — TARA 5 g FORENSIC AUDIT (Phases 7–10)

### 3.1 Identity / fields / units (staging re-verified READ-ONLY, project tunabqqrwabacxjcxxkz, 2026-07-24)

`mapper_basement` row `PI-ING-000492`: `ingredient_name_internal tara_gum`, display
"TARA GUM · Stabilizer", category `stabilizer`, **subcategory `tara_gum` (PURE gum)**, water 9.5 /
total_solids 90.5 / fiber 86.5 / protein 2, **pod_value 0 / pac_value 0**, stabilizer_activity 1,
**recommended_dosage_percent_min 0.2 / max 1** (schema unit: percent **of total mix**, 0–100),
Verified / approved_for_engines / v1.0 / active. Blend counterpart `PI-ING-000490`
("IC · Solmix Stabilizer", subcategory `stabilizer_blend`) carries its OWN 0.2–1 window — separate
identity, never conflated. Matches the Agent B ledger and the repo seed byte-for-byte.

### 3.2 Provenance trace (template → seed → engine → preview)

`fruit_gelato_ref_v1` seeds `T('stabilizer', 5, 'tara_gum', adjustable:false)` — 5 g is VERBATIM
the goldenRecipes raspberry-premium reference proportion; `adjustable:false` marks the role
template-controlled in `buildFormulationProposal` (normalization never scales it), the engine
solver **never proposes tara at all** (`tara_gum` appears in NO `SELECTION_RULES` entry), and the
engine **never reads** `recommended_dosage_percent_*` (Agent B OD-4 confirmed) — hence the
constant 5 g on every preview.

### 3.3 Does the Engine detect excessive stabilizer at all? (Phase 10 — NO)

Exact owner fixture 350/380/80/40/110/35/tara, `fruit_gelato` −11, engine 0.4.0 / config 0.7.0,
bands = milk_gelato **category_fallback** on all indicators (values per actual mass; batch drifts
because only tara changes — recorded as-is):

| tara g | % of mix | POD | PAC | NPAC | ice % | water g | solids g | fat g | protein g | lactose g | overall | violations | batch g |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5.0 | 0.500 | 16.0209 | 24.2120 | 36.6001 | 50.6999 | 689.02 | 310.98 | 38.67 | 32.58 | 41.68 | 82.1399 | fat | 1000.0 |
| 2.1 | 0.211 | 16.0675 | 24.2824 | 36.6186 | 50.6804 | 688.67 | 308.43 | 38.67 | 32.58 | 41.68 | 81.2785 | total_solids, fat | 997.1 |
| 1.9 | 0.191 | 16.0707 | 24.2873 | 36.6199 | 50.6790 | 688.65 | 308.25 | 38.67 | 32.58 | 41.68 | 81.2877 | total_solids, fat | 996.9 |
| 1.7 | 0.171 | 16.0739 | 24.2922 | 36.6211 | 50.6777 | 688.62 | 308.08 | 38.67 | 32.58 | 41.68 | 81.2968 | total_solids, fat | 996.7 |
| 1.4 | 0.140 | 16.0788 | 24.2995 | 36.6231 | 50.6757 | 688.59 | 307.81 | 38.67 | 32.58 | 41.68 | 81.3104 | total_solids, fat | 996.4 |

**Conclusion (pinned structurally in `stabilizerDosage.test.ts`):** across a 3.6 g dose change
POD/PAC/NPAC/ice move < 0.1; tara registers ONLY as generic water/solids/fiber mass (POD 0 /
PAC 0); no violation ever names a stabilizer metric (the `total_solids` flip at low tara is the
generic 31 % band edge, not a stabilizer signal). The Engine has **no stabilizer-activity metric
or band** — moving tara produces **no engine-verified gradient**.

### 3.4 What was implemented (owner Phase 9 — allowed fixes ONLY)

`src/features/formulation/stabilizerDosage.ts` (+ solveOneRound wiring in the pipeline):

- The EXISTING approved Mapper window (0.2–1 % of total mix) connected into the formulation layer
  as **safety clamps**: any solver action that would push a REGISTERED stabilizer identity above
  its max (`add`) or below its min (`reduce`) is rejected at candidate selection
  (`violatesApprovedStabilizerDosage`) — mass-change-aware, exact-identity, deterministic.
- **Pure-gum vs blend identity** enforced as a domain rule: dosage windows resolve by EXACT
  canonical identity (engine id or Mapper id), `approvedStabilizerDosageOfKind` refuses
  cross-kind resolution, unregistered stabilizers get `no_approved_window` — never a borrowed
  window (test 17: non-interchange pinned both directions).
- **Explicit units on every surfaced dosage field**: `percent_of_total_mix` and `grams` are named
  fields on the registry entry, the grams-window and every assessment row.
- **Honest QA diagnostics** (Owner/QA panel rows, ADD-only copy keys): per-line dose, % of mix,
  window + Mapper id, within/below/above/no-window status, and PROVENANCE — a formulation
  preview's stabilizer amount is labelled `seed wzorca (template-controlled)`, and on
  `reference_derived` templates explicitly **„dawka nierozstrzygnięta naukowo dla tego profilu"**.
  5 g is never again presented as scientifically endorsed.
- Template seeds were **NOT rewritten** (verbatim approved/reference records — science freeze);
  the 5 g seed stays the seed (it IS inside the pure-gum window: 0.50 %).

### 3.5 The 5 g VERDICT: **valid-as-seed / UNRESOLVED-as-science** → BLOCKED_SCIENCE (this item only)

- 5 g / 1000 g = 0.50 % — INSIDE the approved pure-gum window (vs MyGelato-copy 1.41 g = 0.141 %,
  BELOW it; reference tool 0.98 g = 0.098 %, further below). No unit mismatch exists anywhere.
- Because the Engine has no stabilizer-activity metric, making the dose solver-ADJUSTABLE would be
  **fake optimization** (no verified gradient) — per the owner's own rule it was NOT done: the
  template-controlled seed stays, bounds act as clamps + diagnostics, provenance labelled.
- **Recorded contradiction for the owner**: the approved G17/G18/V02 references seed tara at
  1.9 g (0.19 %) and the approved sorbet references at 0.8 g (0.08 %) — BELOW the Mapper pure-gum
  minimum 0.2 %. The window and the approved reference templates disagree; only the owner can
  reconcile (the clamp therefore restricts solver MOVEMENT only and never rewrites approved seeds).
- **Exact remaining owner science needed to unblock**: (a) the approved pure-tara dose (or range)
  per profile — including whether the Mapper 0.2–1 % window is binding or advisory against the
  approved reference seeds above; (b) a stabilizer-activity target/metric (or the explicit decision
  that stabilizer dosing stays template-controlled and out of engine scope); (c) OD-3a (is the
  MyGelato "Tara" line pure gum?) remains open from the Agent B ledger.

---

## 4. Changed files

| File | Change |
|---|---|
| `src/stores/recipeStore.ts` | `draftRevision` (monotonic, every material edit incl. apply-rollback and undo), `draftContextSeq` (load/preset/reset), `bumpDraftRevision` seam; not persisted |
| `src/features/constraint-studio/constraintStudioStore.ts` | `selectCanonicalDraft` + `canonicalDraftSerialization`; all preview/apply/undo/feasibility actions consume the selector; previews stamped with `baseDraftRevision`; §17 edits bump the revision; `resetDraftSession`; the store bridge subscriber (context reset + staged invalidation) |
| `src/features/constraint-studio/applyPipeline.ts` | `baseDraftRevision` + revision guard in `commitPreview`; `iterateSolverToFixedPoint` (cap 12, per-round verified improvement, trajectory, stop reasons + no-proposal details, provisional-band classification); `solveOneRound` returns the failure detail and applies the stabilizer dosage clamp; `IterationDiagnostics` exposed on preview + structured failures |
| `src/features/formulation/stabilizerDosage.ts` | NEW — approved Mapper dosage registry (staging-verified), exact-identity + kind-checked lookups, grams window, per-line assessment, solver-action clamp; explicit units throughout |
| `src/features/studio/OwnerDiagnosticPanel.tsx` | QA diagnostic rows ONLY: iteration count/trajectory/stop, stabilizer dose + provenance |
| `src/copy/en.ts` | ADD-only diagnostic copy keys |
| `src/features/constraint-studio/constraintStudioStore.test.ts`, `applyIntegrity.test.ts` | two stale-preview tests updated to the STRICTER contract (material edit invalidates instantly; a resurrected stale preview still blocks at the door) |
| NEW tests | `staleDraftState.test.ts` (12), `optimizerIteration.test.ts` (6), `stabilizerDosage.test.ts` (13) |

## 5. Tests (owner list 1–20 mapping)

1 refresh-equality (Phase 1) · 2–4 revision invalidation ×3 (gram / add+remove / batch+§17) ·
5 stale-REVISION Apply rejected (fingerprint-identical edit-back case) · 6–8 zero semantics ×3
no-refresh through the live stores · 9 ten repeated no-refresh cycles byte-deterministic ·
10 canonical selector = the one draft source · 11 native multi-round (B3, >1 round to 10/10,
monotone verified trajectory) · 12 native fixed point proven (`already_clean` on re-run) ·
13 provisional labelling + guided iteration (best_safe_result + `provisional_band_conflict`) ·
14 determinism ×5 · 15 explicit units on every dosage field · 16 staging-verified identity under
both ids · 17 pure-gum/blend non-interchange · 18 honest deterministic cap (12; `capped` false
when converged) · 19 bounds violations detected (0.5 % within / 0.14 % below / 1.19 % above /
no-window + add/reduce clamps) · 20 engine science unchanged (versions + B1 outputs byte-pinned).
Plus: Phase 10 tara-sweep diagnostic; frozen baselines re-run green (zeroGramSemantics, apply
integrity, batch invariant, no duplicates, no 8×125, complete Undo, beat-the-null, truthful score
coverage — full suites under `constraint-studio/`, `formulation/`, `stores/`).

## 6. Gates

- `npx tsc -b` — clean.
- `npx eslint .` — **0 errors** (2 pre-existing react-refresh warnings elsewhere, untouched — same two the Agent B ledger recorded).
- `npx vitest run` — **4,956 passed; 14 failed, ALL PRE-EXISTING at base `bac7f44`** and byte-identical to the untouched-baseline run performed before any change: `src/features/ingredients/*.migration.test.ts` SQL-DDL string-scans (products 1, productsIdentity 1, productsCodeSequenceGrants 6, productsMapperResults 4, productSnapshots 2). Outside this agent's ownership (ingredients/migrations domain); zero new failures; +31 new tests all green.
- `npm run build` — success.

## 7. Not completed (one exact blocker each)

- **Stabilizer dose optimization** — BLOCKED_SCIENCE: the Engine has no stabilizer-activity
  metric/band, so an adjustable dose has no verified gradient; needs the owner input listed in
  §3.5 (approved per-profile tara dose/range + binding-vs-advisory ruling on the Mapper window
  vs the approved 1.9 g / 0.8 g reference seeds, and/or a stabilizer-activity target).
- **The 14 pre-existing ingredients-migration test failures** — outside this agent's ownership
  (SQL DDL / ingredients domain); already present at the branch base and documented above.
