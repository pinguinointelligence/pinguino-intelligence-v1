# P1-H / P1-I / P1-J / P1-K — ROOT CAUSE, CANDIDATE AUDIT, „NEAREST" SEMANTICS, INVARIANTS

Environment: `offline-staging-head` (7fe10d4c).

## P1-H — the full chain, and WHERE THE FIRST WRONG DECISION HAPPENS

```
 1 UI requested level      HomeCreatorPage.tsx:1096 / ProRecalcPanel — setDirectionTarget('sweetness', −1)
 2 target mapping          recipeDirectionTargets.ts — buildRecipeDirectionPlan → axis 'sweetness'→metric 'pod'
 3 profile target          targetFifth / exactPreferencePoint → band [13,14] (gelato) or point 18 (sorbet)
 4 constraint envelope     solverHolds(): §17 padlocks, grams locks, Main, stabilizer dosage windows
 5 candidate generation    buildDraftCandidateVector() — adjustable lines + relative gram ladder
 6 search bounds           DRAFT_ADJUSTMENT_STEP_FRACTIONS = batch × {0.001 … 0.1}, per round
 7 candidate rejection     strictlyBetter(): fewer violations, or lower severity by > 1e-9
 8 scoring / ranking       measure() = detectViolations(result with Direction bands substituted)
 9 nearest selection       ── FIRST WRONG DECISION IS UPSTREAM OF HERE ──
10 fallback report         directionFallbackTargetSequence(): one detent toward 0, then 0
11 UI refusal              „Nie da się osiągnąć poziomu −1 / Najbliższy możliwy poziom to 0"
```

**The first wrong decision is at step 5–7, not at step 9–11.** Two distinct decisions, proven
separately:

### RC-1 · `applyPipeline.ts:2651-2652` — the escape operator is switched off by an unrelated residual

```ts
const directionOnlyResidual =
  hasExactDirectionObjective && detectViolations(calculateRecipe(working)).length === 0;
```

`directionOnlyResidual` is the ONLY gate on `sweepPairedExchange` — the mass-neutral
two-line exchange written specifically to escape the coordinate-descent trap. On OD-28 the
search halts at `453/94/99/128/55/4/507` carrying **one** unrelated native residual
(`fat:low 3.462`, severity 0.439), so the gate is false, the exchange pass returns at its
first line, the single-line sweep reports `draft_vector_no_improvement`, and CORE answers
INFEASIBLE at POD 16.05 — **2.07 POD points** from a state it can reach.

*Proof by controlled experiment.* With that one gate relaxed and **nothing else changed**,
the same run reaches round 5, applies an exchange, and lands
POD **13.751** ∈ [13, 14] · NPAC **39.537** ∈ [39, 41] · 0 violations ·
`reached: true` · `diagnosticOnly: false` · Σ 1340 g.
(`p1h-trace-baseline.json` vs `p1h-trace-E1.json`.)

The residual that disables the escape is itself produced by the trap the escape exists for
(the milk/cream coordinate the exchange would fix), so the gate is circular.

### RC-2 · `draftCandidateVector.ts` — the search has no move that AIMS at the target

Every move the search can make is a rung of a **fixed relative ladder**
(`current ± batch × {0.001, 0.005, 0.01, 0.02, 0.05, 0.1}`, plus 0 / material floor / 1 g),
accepted only when it **strictly improves** the engine's measure. Nothing in the module ever
computes *where the target is*. The consequences are exactly the three §9 findings:

* **LOCK-01** — the exchange pass DOES run here (native violations `[]`) and still halts at
  POD 14.842, 0.158 below [15, 16], while an engine-verified whole-gram witness exists at
  POD 15.019.
* **LOCK-02** — the halt point is reported as „najbliższy", and it is 26×–156× farther than a
  candidate reachable in the same admissible space.
* **LOCK-03** — the requested level scales the residual but never the descent direction, so
  −1 and −2 halt at the same barrier and return **byte-identical** proposals.

## P1-I — the six candidate-search questions, answered

| # | question | answer |
|---|---|---|
| 1 | Is a legal candidate generated and then rejected? | **Partly.** On OD-28 no legal candidate is ever generated (RC-1 disables the only operator that can build one). On LOCK-02 the two lines that lead to the target (`line-1` BLOOD ORANGE, `line-5` INULIN) **are** in the candidate vector with full ladders (rungs 1…698 and 1…155) — they are generated and rejected by `strictlyBetter`, because every single-line step along them makes the other axis worse first. |
| 2 | Is it never generated because the search space is too narrow? | **Not the ladder's reach** — the ladder is rebuilt every round, so ±10 % per round compounds over 18 rounds. It is the **move shape**: only 1-line and mass-neutral 2-line moves with a delta from a 6-value list. Every witness found in this session needs a 3-line move with a *solved* delta. |
| 3 | Does it exist but get out-ranked? | **Yes, at the rescue layer (AUD-SWEET-13).** The rescue ranks against the untouched draft, so a worse candidate out-ranks the better one the run already holds — 7 of 7 cells. |
| 4 | Does the fallback search a different space than the real solver? | **No.** `computeDirectionFallbackWithServerAuthority` re-enters the same `buildOptimizePreview` with the same draft and the same set; only `goals.direction_targets` changes. Same space, same operators, same blind spot — which is why the fallback cannot certify infeasibility. |
| 5 | Does rounding / practicalization falsely turn feasible into infeasible? | **No.** The witnesses are whole-gram and survive practicalization; `practicalRecipeAuditMatchesInput` — the exact save-gate predicate — returns true for them. |
| 6 | Is the candidate hidden even though it passes the save / production gate? | **Yes.** OD-28's reachable −1 is saveable and producible (P1-B). On all 8 sorbet cells `directionBestCandidate !== null` while `directionFallbackReport.best === null`, and the dialog offers only „Spróbuj inaczej". |

## P1-J — what „najbliższy możliwy poziom" technically means in Gellatti today

CORE already owns **two** different „nearest" authorities:

1. `computeNearestFeasibleLockGrams` (`applyPipeline.ts:5938+`) — a genuine nearest: a
   deterministic **bisection** between a proven-feasible anchor and the infeasible value,
   every probe engine-verified. It answers "nearest feasible **gram value** of a lock".
2. The Direction fallback (`directionFallback.ts:74-106`) — `directionFallbackTargetSequence`
   emits at most two rungs (one detent toward 0, then 0) and `buildDirectionFallback` takes
   **the first rung that verifies**. It answers "nearest feasible **level**".

The ladder is ordered by distance, so "first that verifies" *is* the nearest — **of the levels
the search happens to succeed at**. That is the whole defect: the ordering is sound, the
**feasibility oracle is not**. A level is declared unreachable whenever one strictly-improving
local search from one starting point fails, with no certificate.

**Therefore the existing, consistent definition — and the one this fix keeps — is:**

> *nearest* = the admissible Direction level whose engine-measured distance to the requested
> target is minimal among levels for which CORE holds an **engine-verified legal candidate**;
> ties break toward the level closer to the requested one.

There is no single implementation of that definition today — `computeNearestFeasibleLockGrams`
realises it for lock grams, the Direction fallback does not for levels, and the rescue ranks
against a third baseline entirely (the raw draft). **That inconsistency is itself recorded as a
root cause (RC-3).**

## P1-K — the two invariants, in testable form

**INV-1 — NO FALSE INFEASIBLE.**
For an input `I` with active exact Direction targets: if there exists a candidate `C` in the
same admissible space (every deliberate lock preserved, every required Main/Crown constraint
preserved, profile constraints preserved, machine/process constraints preserved, practicalizable
to whole grams, passing the save gate) with `detectViolations(calculateRecipe(C)) = []` and
`assessRecipeDirection(C).reached = true`, then `buildOptimizePreview(I, …)` must **not** return
`ok:false`, must **not** return `diagnosticOnly:true`, and must **not** produce a
`DirectionFallbackReport` whose `best` sits at a level other than the requested one.

*Test form:* each of the five findings carries a stored, engine-verified witness; the test
re-derives the witness's legality from the engine (never from a stored number) and asserts the
CORE verdict.

**INV-2 — NEAREST IS NEAREST.**
When CORE presents a candidate `P` as the nearest achievable result, then for every candidate
`Q` produced **anywhere in the same run** (draft sweep, paired exchange, exact-target stage,
Direction fallback, starter-pack rescue) that is engine-legal in the same admissible space:
`directionDistance(P) ≤ directionDistance(Q)`.

*Test form:* a run-level assertion — the presented candidate's Direction distance is compared
against every other legal candidate the same run computed, including `directionBestCandidate`
and `starterPackRescueReport.best`. This is checkable, unlike a universal-quantifier claim over
all conceivable recipes, and it is exactly the class AUD-SWEET-13 and LOCK-02 fall into.

## Root causes → findings

| RC | authority / file | findings repaired |
|---|---|---|
| **RC-1** the escape operator is gated on an unrelated residual | `applyPipeline.ts:2651-2652` | OD-28 |
| **RC-2** no move aims at the requested target | `draftCandidateVector.ts` | OD-28, LOCK-01, LOCK-02, LOCK-03 |
| **RC-3** the rescue's improvement baseline is the draft, not the candidate already held | `starterPackDirectionRescue.ts:179,:289` | AUD-SWEET-13 |
