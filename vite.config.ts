import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Heavy qualification matrices (thousands of solver states) are deliberately
    // NOT part of `npm test`. They are not deleted or weakened — they run in full
    // via `npm run vegan:campaign` (vitest.campaign.config.ts) and still fail the
    // build on any contract violation. The rule: the CAMPAIGN DISCOVERS defects,
    // the DEFAULT SUITE PREVENTS their regression, so every defect the campaign
    // finds gets a small deterministic test that stays here.
    exclude: [
      ...configDefaults.exclude,
      'src/**/*.campaign.test.{ts,tsx}',
      'src/**/*.crown-campaign.test.{ts,tsx}',
      // Same rule, same reason: the acceptance harness signs into the staging
      // QA account and resolves real ProductBehavior authority over the
      // network for ~1300 cells. It belongs to `npm run acceptance:matrix`
      // (vitest.acceptance.config.ts), never to `npm test` — a default suite
      // that needs a reachable environment is not a default suite.
      'src/**/*.acceptance.test.{ts,tsx}',
      // SOLVER TIME CONTRACTS — same rule, third application.
      //
      // `recipeVectorProximity.test.ts` asserts that a recipe vector resolves inside
      // 5000 ms. It already has its OWN CI job (`solver-contracts`) whose entire
      // purpose is to run it with no competing workload — but it was never removed
      // from here, so it also ran inside the ~10 000-test default suite on the same
      // shared runner. That second execution measured CONTENTION, which is precisely
      // what the workflow comment says the dedicated job exists to avoid.
      //
      // Evidence (reports/CI_SOLVER_TIMING_FORENSICS.md): the slowest case takes
      // 2861-3229 ms locally on 8 cores and 4502 ms on a PASSING isolated CI run —
      // a 10 % margin. Under full-suite contention it crosses 5000 ms and the build
      // goes red on already-merged staging commits, 5 of the last 8 runs.
      //
      // The contract is NOT weakened: the 5000 ms assertion is untouched, the
      // dedicated job still runs this exact file, and a genuine solver regression
      // still fails the build there.
      'src/features/constraint-studio/recipeVectorProximity.test.ts',

      // STARTER-PACK DIRECTION RESCUE — same rule, fourth application, two reasons.
      //
      // 1. It IS the gate. Measured on the passing staging run 33345896110: this one
      //    file takes 468.5 s of the suite's 955.7 s — 49 % of all test time, for 8
      //    tests, one of which alone runs 459 s. Because `fileParallelism` is false the
      //    whole suite is serial, so this single file sets the critical path of every
      //    PR: `verify` has a p50 of 21.8 min across the last 102 passing runs. Nothing
      //    else in the suite comes close (the runner-up is 162 s; the other 846 files
      //    together are 267 s).
      //
      // 2. It carries its own WALL-CLOCK contract. Line 378 asserts
      //    `exactRuntimeMs + report.totalRuntimeMs < 15_000`. Observed across 20 CI
      //    runs: 7046-10131 ms, i.e. 47-68 % of the budget. That is a real assertion
      //    about the Direction search, so what it measures must be the SEARCH and not
      //    whatever else shares the runner — exactly the argument that moved
      //    `recipeVectorProximity` out.
      //
      // Nothing is weakened and nothing is skipped: the file still runs in full, on
      // every push and every PR, through its own job (`npm run direction:rescue`), and
      // a genuine regression still fails the build there. `solverContractsIsolation`
      // proves both halves — that it left this suite, and that the dedicated job
      // actually executes it rather than passing vacuously.
      'src/features/constraint-studio/starterPackDirectionRescue.test.ts',
    ],
    // Full formulation/Protein proofs are CPU-bound and OCR fixtures load
    // shared language assets. Run files serially so `npm test` exercises the
    // real per-test time contracts without cross-file resource starvation.
    fileParallelism: false,
  },
});
