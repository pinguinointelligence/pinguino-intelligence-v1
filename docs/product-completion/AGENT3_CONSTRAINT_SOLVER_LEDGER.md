# AGENT 3 — CONSTRAINT SOLVER: FORMULATION AUTHENTICITY LEDGER

**Program:** PINGÜINO ENGINE AUTHENTICITY — nightly, Agent 3 (sole code owner:
`src/features/formulation/**` logic + `constraint-studio/applyPipeline.ts` /
`constraintStudioStore.ts`)
**Baseline:** `nightly/integration` = `6f8e680`; branch `agent3/constraint-solver-authenticity`
**Science freeze respected:** no band/PAC/POD/template-value/CONFIG/ENGINE_VERSION change.
Engine (`src/engine/**`) untouched.

---

## 1. Root cause — CONFIRMED against Agent 1's trace (§4 of their ledger)

Reproduced both faces of the owner failure through the real pipeline before changing code:

| Setting | Pre-fix runtime behaviour (probed at 6f8e680) |
|---|---|
| Strawberry LOCKED 900 g, fruit_gelato −11, batch 1000, **capacity 1000** (natural Pro) | Solver invoked ONCE, every ADD capacity-rejected on the PRE-restore hypothetical mass (`verify.ts` capacity gate vs the pipeline's post-verify batch restore), REDUCE blocked by the 900 lock → the `normalize()` proportional projection of `fruit_gelato_ref_v1` shipped verbatim (Milk 55.97/Cream 11.78/SMP 5.89/Suc 16.20/Dex 5.16/Tara 5) — **Agent 1's byte-for-byte reproduction confirmed**. |
| Same, capacity **null** | 12 capped rounds chasing `category_fallback` (milk_gelato) band severity 22.65→14.27, violations 10→10 → Dekstroza 99.64/Mleko 0.21 monster, **also presented and appliable**. |
| Milk LOCKED 900 g, milk_gelato −11 (native bands) | 12 capped rounds, violations 7→**8**, 8 hard NATIVE metrics violated at the end — presented as an OK preview. |

All four root suspects from the contract confirmed: (1) `normalize()` projection became the
final answer when the solver contributed nothing; (2) constrained acceptance
(`mode !== 'constrained_reformulation'` skip + `hardConstrained` commit exemption) masked
zero-move results; (3) fruit_gelato fallback bands are soft, so no hard gate exists at 90 %
fruit; (4) under a dominant lock the ADD half was additionally structurally disabled by the
capacity-ordering defect whenever `machine_capacity_grams == target_batch_grams`.

## 2. Contract implemented

### 2.1 Proportional-scaling detector (owner addendum 1 — permanent runtime check)
`src/features/formulation/proportionalScaling.ts` — pure, deterministic:
per-unlocked-line `scaleFactor_i = output_i / baseline_i` against the PRE-normalization
seed baseline (now captured verbatim in `FormulationProposal.seedBaselineGrams`,
`formulate.ts`). Largest factor cluster within rel. tol. `1e-3`; solver-ADDED lines
(absent from the baseline) count as eligible NON-matching evidence; held lines excluded.
`proportional` ⇔ cluster ≥ 75 % of eligible lines. Runs on EVERY formulation preview.

### 2.2 FormulationProof — the required presentation proof
`applyPipeline.ts`: every formulation preview now carries
`preview.formulation.proof: FormulationProof`:

- `verdict`: `all_bands_in_range` | `engine_improved` (≥1 really-applied verified round AND
  detector says NOT a projection) | `no_feasible_improvement` (zero applied moves OR the net
  result equals the seed projection — per-move rejection reasons in the QA move log).
- `proportionalProjection` + `sharedScaleFactor` (detector evidence),
  `improvingMoves`, `solverInvocations`.
- `bestEffort` + `bestEffortReasons`: `provisional_bands` (never claim optimality on a
  fallback-band profile — fruit_gelato always carries it), `reference_derived_template`,
  `iteration_capped`, `residual_violations_proven_unfixable` (verified fixed point only).
- `stabilizerDoseNotePl` (owner addendum 3): exactly when the FINAL dose still equals the
  template-inherited value (±0.05 g) on a template-controlled, not-user-locked carrier:
  „Dawka stabilizatora pochodzi z szablonu referencyjnego i nie została zoptymalizowana
  przez Engine." (`STABILIZER_TEMPLATE_DOSE_NOTE_PL`; provenance computed in
  `formulate.ts` → `FormulationProposal.stabilizerDose`).

### 2.3 Attempted-move log (QA evidence)
`IterationDiagnostics.attemptedMoves: AttemptedMoveLogEntry[]` — every solver invocation
logs the exact engine actions (`add dextrose 92.8 g` …), outcome
(`applied`/`rejected`/`none`), the rejection reason (`missing_candidate`,
`solver_fixed_point`, `constrained_add_blocked`, `stabilizer_dosage_clamp`, `apply_failed`,
`no_metric_improvement`) and the violations/severity before → after. Rides the preview AND
every structured failure (`no_proposal`, `unsafe_proposal`, `best_safe_result`,
`impossible_under_constraints`).

### 2.4 Capacity-ordering repair (Agent 1 repair (a), coordinator-mandated)
`solverInputWithDeferredCapacity` in `applyPipeline.ts`: capacity is deferred to the
pipeline exactly when the restore guarantee holds — planning lines only (no poured actuals)
AND `target_batch_grams ≤ machine_capacity_grams`. The restored final mass equals the
target batch, so the REAL capacity constraint is re-established by construction (and the
Apply door's batch invariant enforces the restored sum). When the target does not fit the
machine, the engine keeps the capacity gate. The original `machine_capacity_grams` is
restored on the applied state (presentation-invariant). Engine code untouched.
Post-fix: capacity==batch and capacity==null run the identical move search (pinned).

### 2.5 Dominant-lock infeasibility — `impossible_under_constraints`
New structured terminal state (never a Preview): constrained reformulation whose FINAL
state violates hard NATIVE bands while the search exhausted its deterministic budget
WITHOUT proving a fixed point (`capped` — the milk-900 signature: an asymptotic severity
chase, violations 7→8, that can never reach approved ranges under the lock). Carries:
- the EXACT conflicting constraint (dominant held line: id, name, kind, grams),
- `hardViolatedMetrics`, `solverInvocations`, full `iteration` diagnostics + move log,
- `nearestFeasibleGrams`: deterministic bisection (16 steps + 0.1 g verified rounding)
  between the template's own role target (feasible anchor) and the infeasible lock, every
  probe engine-verified through the SAME seed+iterate machinery
  (`computeNearestFeasibleLockGrams`; milk-900 → **698 g**, byte-identical across runs).
  `null` when no feasible anchor exists (honest "no alternative computable").
Polish message (conflict + verified nearest value + „Receptura nie została zmieniona.") in
`previewIssueMessage.ts`; rendered as a structured state in `ProRecalcPanel.tsx`.

**BOUNDARY (deliberate, owner-review):** a VERIFIED fixed point with residual hard
violations is the PROVEN best-achievable state and stays presentable — this is the frozen
accept-with-explanation contract (inulin-0 sorbet Fixture A; milk-500 exact/range; the
smp-100 auto-balance lock fixture — all pinned green). It presents with
`residual_violations_proven_unfixable` + the move-log proof, never as an optimal
formulation. `impossible_under_constraints` fires only when the search cannot even prove a
fixed point within the deterministic budget (capped + hard-native residuals). Purely
structural (stop reason), no invented thresholds, no science.

### 2.6 Apply-door hardening (Agent 1 repairs (b)/(e))
`VerifiedApply.commit`:
- **Proof consistency** (closes the constrained exemption that masked zero-move results):
  an optimize preview carrying `formulation` must carry `proof` + `iteration`;
  `engine_improved` requires ≥1 really-applied round; `all_bands_in_range` is re-verified
  trustlessly on the actual proposed input. A projection can only ever apply as the
  EXPLICIT `no_feasible_improvement` best-effort state.
- **Batch + runaway-target invariants extended to `suggested_fix`** (previously
  `kind==='optimize'`-scoped — the §18.2 fallback bypassed both). The §18.2 no-solver
  fallback itself is now batch-normalized through the approved §17.4 rescale.
- The improvement (beat-the-null) invariant stays optimize-scoped by design: a suggested
  fix is an explicit user-sanctioned lock change whose constrained semantics legitimately
  allow equal-to-null; it is now protected by the batch/runaway/duplicate/preservation
  gates. Documented here as a deliberate decision.

### 2.7 Preview display integrity (Agent 1 §5.2)
`formulation.added[].grams` now report the FINAL post-iteration truth (refreshed from the
working state by canonical ingredient id) — one Preview, one set of numbers.

### 2.8 Owner addendum 4
Explicit batch scaling stays its own preview kind (`batch_rescale`), never carries
`formulation`/`proof`/`iteration` — pinned by test.

## 3. Move-log sample — the owner 900 g case (post-fix, capacity 1000 == batch)

Outcome: OK preview, `verdict: engine_improved`, `proportionalProjection: false`,
`bestEffortReasons: [provisional_bands, reference_derived_template, iteration_capped]`,
strawberry byte-exact 900, batch exactly 1000. Iteration (12 invocations, capped honestly):

```
round  1: add dextrose 178.5 g  applied   viol 10→10  sev 22.647→17.484
round  2: add dextrose  91.9 g  applied   viol 10→10  sev 17.484→15.958
round  3: add dextrose  67.4 g  applied   viol 10→10  sev 15.958→15.272
…
round 12: add dextrose  41.0 g  applied   viol 10→10  sev 14.286→14.271
stop: iteration_cap (capped=true) — never claims a fixed point / optimality
```

The pre-fix zero-move projection can no longer be presented as formulated: with the
capacity ordering repaired the search REALLY runs; if it ever returns zero moves the
verdict is the explicit `no_feasible_improvement` with per-move rejection reasons — and the
Apply door rejects any formulation preview whose proof is missing or inconsistent.
(The capped best-effort composition itself remains scientifically unguided on an unseeded
profile — fruit_gelato calibration is the Phase-8 owner decision; labels now say so.)

Strawberry-600 (feasible): `engine_improved`, 2 applied moves
(`add dextrose 92.8 g`, `add inulin 136.9 g`), violations 10→5, soft-only residuals.

## 4. Files

- `src/features/formulation/proportionalScaling.ts` — NEW: detector (pure).
- `src/features/formulation/formulate.ts` — seed baseline capture + stabilizer-dose
  provenance (additive fields; no behaviour change).
- `src/features/constraint-studio/applyPipeline.ts` — proof/verdict, move log, capacity
  deferral, impossible state + bisection, door hardening, added[] refresh,
  suggested-fix fallback normalization, `iterateFormulationSeed` extraction.
- `src/features/constraint-studio/previewIssueMessage.ts` — impossible message (PL).
- `src/features/pro-core/ProRecalcPanel.tsx` — renders the new structured state (1 branch).
- `src/features/formulation/formulationAuthenticity.test.ts` — NEW: permanent suite.

## 5. Tests (owner addendum 2 — all added in `formulationAuthenticity.test.ts`)

scaling detection (squeeze detected / real formulation not / added-line evidence / held
lines excluded) · Engine evaluation after EVERY projection (round-0 measured + provable
verdict, 3 lock levels) · improve-over-projection or fixed-point proof · structural ≠
quality validity (strawberry-350 fixed point) · impossible constraint → impossible with
exact conflict · nearest-feasible deterministic + engine-verified (two byte-identical runs,
re-run at 698 not impossible) · exact locks byte-exact · range respected · native
−11/−12/−13 DISTINCT formulas · Sorbet receives no dairy · Gelato never silently loses a
hard role (excluded milk → honest stop) · identical input → byte-identical output incl.
proof + move log · prior state cannot contaminate (interleaved runs reproduce) ·
Apply writes exactly the previewed grams and Undo restores byte-exact · tara
template-dose sentence exposed / withheld when solver-reworked · batch rescale never a
formulation · capacity==batch equivalence with capacity==null.

Frozen suites: zeroGramSemantics, constrainedReformulation, applyIntegrity,
optimizerIteration (cap 12 + stop reasons), autoBalance, boundary pins, batch/locks/dupes
gates, formulation, liveRuntime, nightlyP0 — all green (full run below).

## 6. Gates

- `tsc -b` — clean.
- `eslint .` — 0 errors (2 pre-existing react-refresh warnings outside my files).
- `vitest run` — FULL suite green (see final message for the count).
- `npm run build` — green.

Environment note: this agent worktree was provisioned with CRLF-materialized files under a
stale git stat cache (system `core.autocrlf=true` vs repo `false`); 14 `*.migration.test.ts`
failures were disk-EOL artifacts of that provisioning (comment-stripping broke on CRLF),
proven identical on the untouched baseline and repaired worktree-locally by normalizing the
files back to their committed LF bytes (hash-verified `git status` clean; no shared config
touched, no SQL content changed).
