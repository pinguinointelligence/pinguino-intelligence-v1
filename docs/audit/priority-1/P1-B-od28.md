# P1-B — OD-28 (AUD-SWEET-OD28) REPRODUCTION

Environment: `offline-staging-head` (7fe10d4c). Real store doors, real shared PRZELICZ.
Only Supabase-backed services faked (ProductBehavior RPC → repo fixture, country
products → `[]`, Mapper → repo `mapper_basement.csv`). Served staging unreachable → P1-B
cannot be run on the served build; see P1-A `[H]`.

## VERDICT: **CONFIRMED FALSE INFEASIBLE**

## Repro (exact)

HOME door · new gelato · account default sweetness **−1** · Ninja CREAMi Deluxe ·
2 containers (**1340 g**) · starter generated · **STRAWBERRIES · Fresh Fruit 507 g**
(`PI-ING-001553`, `amountIntent: user_exact`, becomes a `grams` lock) · PRZELICZ.

## What CORE answers

```
DirectionFallbackDecision: „Nie da się osiągnąć poziomu -1" / „Najbliższy możliwy poziom to 0."
```

`buildOptimizePreview(input, set, …, {directionFallbackPass:true})` at sweetness −1 returns
`ok:true` but **`diagnosticOnly:true`, `directionAssessment.reached:false`** — which is what
`shouldRunDirectionFallback` fires on. The fallback ladder is exactly `[{sweetness:0}]`
(one rung, because softness is already 0), it verifies, and the customer is told 0.

## Why that answer is FALSE — three independent proofs

1. **Whole-gram witness, engine-verified.** `365 / 200 / 102 / 82 / 80 / 4 / 507`
   (milk / cream / SMP / sucrose / dextrose / tara gum / strawberries) — Σ **1340 g** = batch,
   POD **13.983** ∈ sweetness −1 band **[13, 14]**, NPAC **39.198** ∈ softness 0 band **[39, 41]**,
   `detectViolations` **[]** (native) and **[]** (Direction-substituted), `assessRecipeDirection.reached = true`.
2. **The product itself reaches it.** One more tap on „Mniej słodkie" after accepting „0"
   applies −1 with no refusal at all (`od28f-savegate.json`, path B).
3. **It is saveable and producible.** `practicalRecipeAuditMatchesInput(buildRecipeInput(state), state.practicalRecipeAudit)`
   — the exact predicate `useCanonicalRecipeSave.ts:137/:292` gates on — returns **true**,
   all grams whole, Σ = target.

## Where the solve actually stops

`preview.iteration` for the refused −1 solve:

```
stopReason      fixed_point_no_proposal
stopDetail      missing_candidate
capped          false
solverInvocations 5 · draftVectorSearches 5
rounds  0: 9 viol / sev 20.157
        1: 5 viol / sev  8.849
        2: 2 viol / sev  6.048
        3: 2 viol / sev  4.931
        4: 2 viol / sev  4.593   ← declared fixed point
round 5 move 'none'                rejection 'missing_candidate'         (canonical solver)
round 5 move 'draft-vector (5 lines)' rejection 'draft_vector_no_improvement' (draft sweep)
```

Final state `453 / 94 / 99 / 128 / 55 / 4 / 507`, Σ 1340:
POD **16.050** (band [13,14] — **2.05 points outside**), NPAC 39.083 (softness 0 **reached**),
native violation `fat:low 3.462` (severity 0.439).

The witness POD is 13.983. The search stopped **2.07 POD points** from a state it could reach.

## Evidence files
`scratchpad/p1/results/p1h-trace-baseline.json`, `p1h-trace-E1.json`, `od28f-savegate.json`
