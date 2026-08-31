# CI-INFRA — the gate's critical path: forensic evidence

**Goal:** make the CI gate reflect the code honestly, and stop paying 22 minutes for it.
**Non-goal:** making anything green that should be red. No threshold is raised, no test is
skipped, weakened or rewritten, and no solver, Engine or ProductBehavior code is touched.

Companion to `CI_SOLVER_TIMING_FORENSICS.md`, which covers `recipeVectorProximity`.

Measured 2026-08-31 over the last **120 CI runs / 360 jobs**, base `staging c004d659`,
`ubuntu-latest` = 4 cores / 15 GiB.

---

## 1. The reported hang does not exist

A recorded technical-debt item stated that `npm test` intermittently **hangs**, produces no
summary, and is killed after ~19 minutes of silence — citing PR #34 and pointing at
`proteinMultiMainPositive.test.ts`.

That is an artefact of the **tool used to read the log**, not of CI. `gh run view --log`
truncates long job logs — observed cut at ~4 000 of **14 910** real lines — with no
truncation marker. The output simply stops mid-suite.

Pulled from the raw archive instead (`gh api repos/.../actions/runs/<id>/logs`), run
`33339829498` reads:

| Time     | What actually happened                                                                            |
| -------- | ------------------------------------------------------------------------------------------------- |
| 22:45:14 | last line visible in the truncated view — a `stdout` line from `proteinMultiMainPositive.test.ts` |
| 22:45:16 | that file **passes** — 21 tests, 20 662 ms                                                        |
| 23:01:20 | still running, still logging (`machineRecipeBatchMatrix`, OCR fixtures, wasm reader)              |
| 23:04:16 | `FAIL recipeVectorProximity.test.ts` · `Test timed out in 5000ms` → `846 passed` → exit 1         |

No kill, no OOM, no starved worker, no missing exit code — in any run examined. PR #34's own
failure was in the `solver-contracts` job; its `verify` job **passed**.

### Failure census, last 120 runs

`verify` failed 18×:

| Cause                                                                     | Count | Status                                    |
| ------------------------------------------------------------------------- | ----- | ----------------------------------------- |
| `recipeVectorProximity` on the 5000 ms default                            | 14    | closed by `283b24b5` (excluded + own job) |
| genuine code failures on WIP branches (lint, assertions, import boundary) | 4     | not infrastructure                        |
| hangs / kills / OOM                                                       | **0** | —                                         |

`Solver time contracts (isolated)`: 35 failures on 2026-08-30, **0 since** the 30 s allowance
landed.

**Consequence for the original investigation brief:** leads 1 (runner contention), 3 (process
starvation / OOM) and 5 (dedicated runner resources) address a symptom that never occurred.
The brief also lists the 5000 ms `recipeVectorProximity` threshold as owner-locked; the
2026-08-30 audit recorded in `ci.yml` found that false — the file contains no timing assertion
and 5000 ms was simply Vitest's default. Section 3 lists the budgets that _are_ real.

---

## 2. One file is the entire gate

`vite.config.ts` sets `fileParallelism: false`, so 849 files run strictly serially while three
of four cores idle. `verify` p50 = **21.8 min** (min 12.6, max 23.6, n = 102 passing runs).

Measured on passing run `33345896110` — total test time **955.7 s**:

| File                                                    |    Duration |   Tests |      Share |
| ------------------------------------------------------- | ----------: | ------: | ---------: |
| `constraint-studio/starterPackDirectionRescue.test.ts`  | **468.5 s** |       8 | **49.0 %** |
| `constraint-studio/directionRecoveryRegression.test.ts` |     162.4 s |       6 |     17.0 % |
| `constraint-studio/mainTechnicalMaximum.test.ts`        |      57.7 s |      46 |      6.0 % |
| the other 846 files combined                            |     267.1 s | ≈10 288 |     27.9 % |

One test inside the first file runs **459 s** on its own.

### Longest-processing-time simulation over all 849 measured durations

| Arrangement                                                           |                  Makespan |
| --------------------------------------------------------------------- | ------------------------: |
| today — strictly serial                                               |                   955.7 s |
| 2 / 3 / 4 / 8 / ∞ workers, all files together                         | **468.5 s** (never lower) |
| `starterPackDirectionRescue` alone in a second job, both lanes serial |               **487.2 s** |
| top 2 files into one shared serial job                                |         631.0 s _(worse)_ |
| top 5 files into one shared serial job                                |         757.1 s _(worse)_ |

The floor is one internally-serial file. **More cores buy nothing; more workers buy nothing.**
Heavy files must get separate lanes, not one shared "slow" job — which is the correction to
lead 4 of the brief. Going below 468.5 s requires changing that test, which is solver work and
explicitly out of scope here.

---

## 3. Wall-clock contracts — the complete inventory

These four files, and only these four, assert elapsed time. They are why
`fileParallelism: false` exists, and they bound every proposal above. **None may be raised.**

| File                                           | Assertion                                            | Observed on CI                  |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------------------- |
| `starterPackDirectionRescue.test.ts:378`       | `exactRuntimeMs + totalRuntimeMs < 15_000`           | 7 046 – 10 131 ms (47–68 %)     |
| `proteinMultiMainPositive.test.ts:659,703,721` | `runtimeMs < LOCAL_SERVED_RESULT_BUDGET_MS` (15 000) | **9 244 – 12 291 ms (62–82 %)** |
| `sorbetDirectionApplyDoor.test.ts:235`         | `runtimeMs < 8_000`                                  | file total 1 753 ms             |
| `barcodePerformance.test.ts`                   | `p50 / p95 / max < 500`                              | file total 15 ms                |

Row 2 is the binding constraint on the whole design: an ~18 % margin on a genuine asserted
budget. `recipeVectorProximity` went red 5 times in 8 runs on a 10 % margin. **Enabling file
parallelism today would break this contract**, which is why lead 2 of the brief is not acted on.

---

## 4. Latent 5000 ms flakes — tests near their own default budget

Every test the runner reported as slow, against _its own_ effective budget (file-level
`vi.setConfig`, an inline third argument, or Vitest's bare 5000 ms default):

| Test                                                                           | Observed |   Budget | Source  |       Used |
| ------------------------------------------------------------------------------ | -------: | -------: | ------- | ---------: |
| `repairs Protein support before searching the exact -13 ECO 2:1 Main envelope` | 4 619 ms | 5 000 ms | default | **92.4 %** |
| `dark-cocoa-wholesomeyum at /COCOA ALKALIZED/i`                                | 3 713 ms | 5 000 ms | default |     74.3 % |
| `protein_gelato @ -12 applies every operational target`                        | 3 630 ms | 5 000 ms | default |     72.6 % |
| `requires the explicit best-achievable decision before normal Preview`         | 3 051 ms | 5 000 ms | default |     61.0 % |
| `ECO at -12 °C never trades away the protein claim`                            | 2 865 ms | 5 000 ms | default |     57.3 % |

The first is the same signature `recipeVectorProximity` had before it broke (4 468–5 151 ms
against the same 5 000 ms, median 5 007 ms) — measured at 4 619 ms and 4 635 ms on two
unrelated _passing_ runs. It is fixed in this change; the other four are prerequisites for any
future parallelism and are left as-is.

---

## 5. What changed

1. **`proteinMultiMainPositive.test.ts`** — the 92.4 % test gets an inline `30_000` harness
   allowance, matching what `vitest.solver-contracts.config.ts` already gives that suite. The
   test asserts no elapsed time; its three timed siblings already carry explicit budgets.
2. **`starterPackDirectionRescue.test.ts`** — excluded from `npm test`, given
   `vitest.direction-rescue.config.ts`, `npm run direction:rescue` and its own always-run CI
   job, for two reasons: it is 49 % of the gate's cost, and it asserts its own wall-clock
   budget, which is only honest uncontended.
3. **`src/qa/solverContractsIsolation.test.ts`** — generalised over a table of isolated suites,
   so both lanes are proven to have left the default suite _and_ to be really executed. The
   vacuity trap is the dangerous one: a dedicated job whose config matched nothing would pass
   green having verified nothing.

Verified locally: exclusion proven both ways (`vitest list` matches nothing in the default
suite, all 8 tests under the dedicated config), the isolated lane runs green, the guard passes
19/19, and the owner-locked, protected-path and whitespace gates are all clean.

**Expected effect:** `verify` test time 955.7 s → ~487 s, with `direction-rescue` (~469 s)
running concurrently. Both lanes stay serial, so no test is newly observed under contention and
no timing contract changes meaning.
