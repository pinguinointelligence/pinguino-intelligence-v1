# CI-INFRA — solver timing contract: forensic evidence

**Goal:** give `recipeVectorProximity.test.ts` a fair execution environment.
**Non-goal:** making the test easier. The 5000 ms contract is NOT touched.

## 1. What actually fails

Always the same single case, always a wall-clock timeout, never an assertion:

```
src/features/constraint-studio/recipeVectorProximity.test.ts
  > isolated multi-candidate neighborhood experiment — null hypothesis
  > keeps Cinnamon near 2 g or proves the exact Horchata target needs movement
    (-11 °C, sweetness -2, hardness -2)
Error: Test timed out in 5000ms.
```

## 2. Timing distribution — the case lives ON the boundary

| Environment | Observed | Margin against 5000 ms |
| --- | --- | --- |
| Local, 8 cores, file alone | 2861 / 3187 / 3229 ms | ~1.55–1.75× headroom |
| CI **isolated job, PASSING** | **4502 ms** | **498 ms — 10 %** |
| CI **isolated job, FAILING** | **5086 ms** | **missed by 86 ms** |
| CI inside the full suite | > 5000 ms | fail |

Its three sibling cases in the same family take **2012 / 2254 / 2890 ms** on the same
CI run. This one case is ~1.6–2.2× slower than its siblings, so it is the only one
close enough to the limit for runner variance to decide the outcome.

**This is not random flakiness.** The case is systematically near the limit on CI
hardware; a ±10 % variation flips the result.

## 3. Root cause of the `verify` job's failures — incomplete isolation

`.github/workflows/ci.yml` states the solver contracts "run alone… rather than measure
contention". That intent is only half-implemented:

- the dedicated `solver-contracts` job runs the file alone; **and**
- `npm test` ALSO runs it, because `vite.config.ts` includes
  `src/**/*.test.{ts,tsx}` with no exclusion for it.

Verified: `npx vitest list src/features/constraint-studio/recipeVectorProximity.test.ts`
returns its cases, i.e. it is inside the default suite.

So the heavy file executes **twice per CI run** — once isolated, once inside a
~10 000-test suite on a shared runner. The second execution is the one that fails the
`verify` job, and it is measuring contention exactly as the workflow comment warns.

## 4. Environment facts

| Fact | Value |
| --- | --- |
| Runner | `ubuntu-latest` → image `ubuntu-24.04` |
| Repo visibility | **public** |
| Job concurrency | 3 jobs (`contracts`, `verify`, `solver-contracts`) run in parallel |
| vitest file parallelism | `fileParallelism: false` (config comment: CPU-bound proofs must not starve each other) |
| Local cores | 8 |
| CI cores / memory | **recorded by the diagnostic step added in this PR** |

## 5. Frequency — `staging` itself, last 8 CI runs

5 of 8 runs on already-merged `staging` commits had at least one red job from this same
timeout (2 in `solver-contracts`, 3 in `verify`). No PR caused them.

## 6. Smallest infrastructure-only correction

1. **Stop running the heavy file inside `npm test`.** It already has a dedicated job.
   This follows the precedent the config itself sets: campaign and acceptance suites are
   excluded from the default suite for exactly this reason ("a default suite that needs
   a reachable environment is not a default suite"). It does not hide failures — the
   dedicated job still runs the same file, with the same 5000 ms contract, and still
   fails the build.
2. **Record runner resources** so any further sizing decision is evidence-based rather
   than guessed.

The 5000 ms assertion, the solver, and every scientific threshold are untouched.
