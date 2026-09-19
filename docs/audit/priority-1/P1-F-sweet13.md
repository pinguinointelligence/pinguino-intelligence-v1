# P1-F — AUD-SWEET-13 REPRODUCTION

Environment: `offline-staging-head` (7fe10d4c). Served half `[H]` (see P1-A).
Evidence: `scratchpad/p1/results/p1f-sweet13.json`.

## VERDICT: **CONFIRMED — and worse than recorded**

`classic-blood-orange-sorbet`, PRO, 1000 g. In all 8 non-zero cells the run ends with
`directionFallbackReport.best === null` **and** `directionBestCandidate !== null` — CORE
holds an applicable, engine-clean candidate that the dialog does not offer. The only button
the dialog renders is „Spróbuj inaczej" → `requestStarterPackRescueWithServerAuthority()`.

Distance = Σ Direction severity points (the engine's own two-axis measure).

| cell | held candidate (6 lines) | offered by „Spróbuj inaczej" (7 lines) | verdict |
|---|---|---|---|
| sweetness −2 | **3.1110** | 4.2166 | **worse** |
| sweetness −1 | **1.1110** | 2.2166 | **worse** |
| sweetness +1 | **0.0879** | 0.3957 | **worse (4.5×)** |
| sweetness +2 | **0.0273** | 1.8592 | **worse (68×)** |
| softness −1 | **0.0401** | 0.7429 | **worse (19×)** |
| softness +1 | **0.0995** | 0.1195 | **worse** |
| softness +2 | **0.1282** | 0.4401 | **worse (3.4×)** |
| softness −2 | 0.0200 | *(rescue returns nothing)* | true dead end |

**7 of 7**, not 6 of 7. The audit's "6 of 7" was measured on the **requested axis alone**;
on the engine's own two-axis measure `softness/+1` is worse as well (its POD drifts while
NPAC improves). Every offered candidate adds the same unrequested 7th line,
`PI-ING-000496 · FRUCTOSE · Sweetener`, under the headline
„Można zbliżyć się bardziej do poziomu X".

## Root cause (code, not inference)

`src/features/constraint-studio/starterPackDirectionRescue.ts`

```
:179   const currentDistance = directionDistance(request.input, bands);
:289   const materiallyHelps = direction.reached ||
         (hardValid && (compareDirectionDistance(distance, currentDistance) ?? 0) < 0);
```

`request.input` is the **untouched draft** (POD 20.763). The rescue therefore accepts any
candidate that beats the *draft*, even when it is far worse than the candidate the run
already proved. `constraintStudioStore.ts:4233` does hand the proven candidate in as
`normalResult` — but `normalResult` is read **only** by
`shouldRunStarterPackDirectionRescue`, never as the ranking baseline.

This is a pure **selection/ranking** defect and it is exactly the second P1-K invariant:
CORE presents a "nearest" that is not nearest, while holding a nearer one in the same run.
