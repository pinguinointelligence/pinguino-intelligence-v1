/// <reference types="vitest/config" />
/**
 * Solver TIME contracts — NOT part of `npm test`.
 *
 * `recipeVectorProximity.test.ts` asserts that a recipe vector resolves inside
 * 5000 ms. That is a real contract, not a slow test — so what it measures has to be
 * the SOLVER, not whatever else happens to be running on the same runner.
 *
 * It already had a dedicated CI job for exactly this reason, but the file was never
 * removed from the default suite, so it also ran inside the ~10 000-test `npm test`
 * on a shared runner. Measured evidence
 * (`reports/CI_SOLVER_TIMING_FORENSICS.md`): the slowest case takes 2861-3229 ms
 * locally on 8 cores, **4502 ms on a PASSING isolated CI run** — a 10 % margin — and
 * **5086 ms when it fails**. Under full-suite contention it crosses the line, which
 * turned already-merged `staging` commits red in 5 of 8 runs.
 *
 * This config is how the dedicated job keeps running the file after it is excluded
 * from the default suite. Without it the job would match nothing and pass VACUOUSLY,
 * which is strictly worse than the flake it was meant to fix.
 *
 * THE CONTRACT IS UNCHANGED. The 5000 ms assertion, the solver and every scientific
 * threshold are untouched; a genuine solver regression still fails this run with a
 * non-zero exit code. The only thing corrected is the environment it is observed in.
 *
 * Run it:
 *   npm run solver:contracts
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/features/constraint-studio/recipeVectorProximity.test.ts'],
    // One file, one worker, nothing else competing — the point of the exercise.
    fileParallelism: false,
    /**
     * A HARNESS ALLOWANCE, NOT A PERFORMANCE TARGET.
     *
     * Vitest's default 5000 ms was never a product requirement. Audited 2026-08-30:
     * this file contains NO timing assertion of any kind — no performance.now, no
     * Date.now, no elapsed check. All 24 assertions are correctness (the single
     * `toBeLessThan` is on cinnamon GRAMS, not milliseconds). Vitest simply killed
     * the test at its default timeout. No owner-locked contract and no entry in
     * `AGENTS.md` or `protectedPaths.json` defines a solver runtime threshold.
     *
     * Measured on the unchanged SHA 883e76f8, 4-core/15Gi GitHub runner:
     * 4468 / 4944 / 5007 / 5020 / 5151 ms — median 5007 ms, i.e. the DEFAULT sat
     * below the median and produced 2 passes and 3 failures from identical code.
     * Locally the same case takes ~2.4-3.2 s.
     *
     * 30 s gives the slower shared runner real room while still making a genuine
     * hang obvious. Termination itself is guaranteed structurally and independently
     * of the clock — `iteration_cap`, bounded_exact Direction search, bounded
     * coordinate sweeps and the bounded frontier — all covered by their own tests.
     *
     * Scoped deliberately to THIS suite. The global default stays 5000 ms for the
     * ~10 000 other tests.
     */
    testTimeout: 30_000,
  },
});
