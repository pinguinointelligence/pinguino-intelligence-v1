# P1-L — FIX DESIGN

Three root causes, three authority-level fixes. RC-2's single fix repairs four of the
five findings; nothing here is a per-case exception.

**Explicitly NOT done, as instructed:** no strawberry exception, no Ninja exception, no
`−1` exception, no HOME-only exception, no UI auto-accept masking a refusal, no
hard-coded "nearest". Nothing reads an ingredient id, a profile name or a level.

---

## RC-1 — the escape operator is switched off by an unrelated residual

* **Authority / file / layer:** `src/features/constraint-studio/applyPipeline.ts:2651` — solver layer, the gate on `sweepPairedExchange` (PROTECTED PATH).
* **Minimal fix:** make `directionOnlyResidual` a strict **superset** of the approved
  condition — it still fires on the engine-clean case exactly as before, and now also
  fires while the requested Direction is still unreached.
* **Repairs:** OD-28.
* **Regression risk:** the pass costs extra engine evaluations on Direction runs that
  previously skipped it. It is bounded by the existing `PAIRED_EXCHANGE_EVALUATION_BUDGET`
  (400) and `PAIRED_EXCHANGE_MAX_PASSES` (12), cannot raise the violation count
  (`strictlyBetter`), and is unreachable without `direction_targets_active`, so no
  non-Direction flow changes at all.
* **Test strategy:** OD-28 must return a reached, non-diagnostic preview; the negative
  controls must still refuse.

## RC-2 — no move in the search ever AIMS at the requested target

* **Authority / file / layer:** `src/features/constraint-studio/draftCandidateVector.ts` — the solver's candidate-move layer (PROTECTED PATH), plus its wiring in `applyPipeline.ts`.
* **Minimal fix:** one new deterministic move generator, `sweepExactDirectionTarget`.
  At fixed total mass each axis metric responds **affinely** to a mass-neutral gram
  transfer (verified on the engine: POD 13.731241 → 13.803189 → 14.450721 → 17.328641 for
  +1 / +10 / +50 g, exactly linear, and `applyCorrectionActions` realises the transfer
  byte-exact). So the engine's own response is measurable with **one probe per line**, and
  the stage then *solves* the 1×1 or 2×2 linear system that lands the requested axes
  exactly, instead of hoping a rung of the fixed ladder lands there.
  * It reads no band, no level, no coefficient: the caller passes `(read, target)` pairs
    built from its own Direction plan, so the module keeps its no-Direction boundary.
  * The admissible space is **unchanged**: per-line bounds are the ladder's own reach,
    and §17 padlocks, Main, poured actuals, the stabilizer dosage window and
    `applyCorrectionActions` all still decide.
  * **Preserve first (§8/§12):** by default the stage never enters the deviating region
    of the ladder. A second pass may, and its result is kept **only when it fully
    REACHES** the requested level — the same rule the single-line sweep already applies,
    with the existing user-intent deviation report and consent gate describing it.
  * It runs **last**, only after both existing passes have failed, so it cannot change a
    trajectory either of them could already take.
* **Wired at the three points where the shown candidate is finally chosen**, through one
  shared `rankDirectionCandidate`: the formulation route, the local-correction route and
  the practical Direction polish — plus the sorbet route, where the generators are now
  **ranked by distance** instead of "first that improves".
* **Repairs:** OD-28, LOCK-01, LOCK-02, LOCK-03 (partially — see below).
* **Regression risk:** more accepted trajectories on Direction runs. Bounded by
  `EXACT_DIRECTION_EVALUATION_BUDGET` (400) and `DIRECTION_AIM_MAX_PASSES` (6); every
  candidate must pass the caller's full admissibility gate (batch invariant, both
  constraint sets, positive-standard presence, the required-line contract, Main identity,
  and **no new native violation**) before it can be accepted.
* **Test strategy:** the five repro drafts frozen as a fixture; assert requested target,
  candidate existence, verdict, nearest candidate, constraints held, whole grams, no
  silent unlock, determinism.

## RC-3 — the rescue's improvement baseline is the draft, not the candidate already held

* **Authority / file / layer:** `src/features/constraint-studio/starterPackDirectionRescue.ts:179,:289` — the rescue's ranking layer (not a protected path).
* **Minimal fix:** the baseline is the **best thing the run can already show** — the
  proven candidate the caller already passes in as `normalResult`, falling back to the
  draft when there is none.
* **Repairs:** AUD-SWEET-13.
* **Regression risk:** the rescue now returns `best = null` in cells where its candidate
  is worse than the one already held. That is the intended behaviour and it is honest,
  but it is a **visible change**: where the dialog used to offer a worse path it now
  offers none. The records are still reported (`reason: 'no_material_improvement'`), so
  nothing is hidden from diagnostics.
* **Test strategy:** the 7 sorbet cells must never offer a candidate farther from the
  requested level than `directionBestCandidate`.

---

## What is closed and what is not

| finding | before | after | status |
|---|---|---|---|
| **OD-28** | „Nie da się osiągnąć poziomu −1", POD 16.050 | **reached**, POD 13.751, 0 violations, saveable | **FIXED** |
| **AUD-SWEET-13** | offered path worse than the held candidate in **7/7** cells | never worse; better where a better one exists | **FIXED** |
| **LOCK-01** | distance 0.3159, not reached | distance **0.0290** (10.9× nearer), still not reached | **IMPROVED, NOT CLOSED** |
| **LOCK-02** | distance 0.647–3.111; `line-1` and `line-5` never moved | 1.4×–13.2× nearer; `line-1` moves in every improved cell | **IMPROVED, NOT CLOSED** |
| **LOCK-03** | −1 and −2 byte-identical (config A and B) | config A now differs; **config B +1/+2 still identical** | **PARTIALLY FIXED** |

### The remaining gap, stated precisely

The aim is a **bounded greedy** search: it solves for the exact landing, clamps to the
ladder's reach, and repeats. It is therefore still **trajectory-sensitive** — on
`LOCK-02a` a different step order reached 0.285 in one configuration and 0.802 in
another, and neither is the 0.023 the offline prototype found when it was free to rank
every candidate it generated rather than only the ones a greedy path visits.

Closing LOCK-01/02/03 to "reached" needs the next step the prototype already
demonstrates: keep the **top-K** candidates per stage instead of one (a small beam), and
rank on the **post-practicalization** vector, because on an exact-POINT Sorbet target
(band min = max) whole-gram rounding dominates the distance. That is a contained change
to the same authority — it adds no new science and no new admissible space — but it is a
change to a protected path's search shape and it is **not** included here.

`LOCK-03` config B `+1`/`+2` returning the same vector is, on the evidence, **not**
necessarily a defect any more: with `SUCROSE` locked at 104 g and the softness axis
pinned to the exact point 37.5, the nearest feasible point in the POD-increasing
direction genuinely is the same for both requests. What is still missing there is the
*signal* that the level was separately attempted — and that is presentation, which the
owner placed outside this block.
