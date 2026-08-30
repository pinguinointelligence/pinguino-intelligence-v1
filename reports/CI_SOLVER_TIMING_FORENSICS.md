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

---

# PART 2 — the isolated job: options investigated and exhausted

## A. Larger / more deterministic runner — **UNAVAILABLE**, confirmed from configuration

Checked rather than assumed:

| Check | Result |
| --- | --- |
| `gh api users/pinguinointelligence` | `type=User` — **not an organization** |
| `gh api repos/…/actions/runners` | `total_count = 0` — no self-hosted runners |
| `gh api orgs/pinguinointelligence/actions/runner-groups` | **404 Not Found** |

GitHub-hosted larger runners are an **organization-level** feature. This repository is
owned by a personal account, so no larger runner label can be selected for any job.

## B. Process-level isolation — **ALREADY SATISFIED**

Recorded by the diagnostic step now in the job:

```
cores:  4
memory: 15Gi
load:    22:22:55 up 0 min,  0 user,  load average: 0.65, 0.18, 0.06
```

The dedicated job already runs on a **freshly booted, idle 4-core / 15 GB machine**,
executing **one file**, with no coverage, no instrumentation, no build and no other
test workload. `fileParallelism: false`. There is nothing left to isolate — and it
still measured **4516 ms** on that clean machine.

## C. Vitest pool tuning — measured, **no material gain**

Slowest case, local, repeated runs:

| Pool | Runs | Median |
| --- | --- | --- |
| `forks` (default) | 3432 / 2427 / 2403 / 2410 ms | **~2419 ms** |
| `threads` | 2487 / 2489 / 2498 / 2447 ms | ~2488 ms |
| `vmThreads` | 6511 / 6014 / 5931 ms | ~6014 ms |
| `vmForks` | 6034 / 6119 / 6099 ms | ~6099 ms |

`threads` is marginally slower in median but noticeably tighter in spread; the VM pools
are **~2.5× worse** and are rejected outright. The existing default is already the best
available. No pool change is proposed.

## D. Harness doing unrelated work — **DISPROVEN**

Hypothesis: the slow case is first in its `it.each` array, so it might be absorbing
module/JIT warm-up that belongs to the file rather than to the case.

Test: run each case ALONE (so each is first and cold).

| Case | Alone & cold | In-file |
| --- | --- | --- |
| **(-11, -2, -2)** | **2662 ms** | ~2861–3229 ms local · 4516 ms CI |
| (-12, -2, -1) | 1800 ms | 2271 ms |
| (-13, -2, 1) | 1858 ms | 2892 ms |

Slowness follows the **parameters, not the position**: run identically, the `-11 / -2 /
-2` case is ~1.45× more expensive than its siblings. It is genuinely the hardest case
in the family. **There is no harness waste to remove**, so under the stated rule the
test must not be rewritten.

## E. Conclusion

CI hardware is roughly **1.7× slower per core** than the local machine
(2662 ms local → 4516 ms CI for the same work). The contract needs **90 % of its
budget** on the fastest environment this repository can obtain.

**The available CI infrastructure cannot provide materially better headroom for the
isolated job.** Reporting that, as instructed, rather than weakening the contract.

## What this PR still fixes definitively

The **duplicate execution** is real and removable. Of the 5 red runs observed on
already-merged `staging`, **3 were the `verify` job** failing on this file inside the
~10 000-test suite. Excluding it there eliminates that entire class, and the guard
proves the dedicated job did not become vacuous in exchange.

The remaining exposure is the isolated job alone, at ~10 % margin, which is an
infrastructure limit rather than a code or contract defect.
