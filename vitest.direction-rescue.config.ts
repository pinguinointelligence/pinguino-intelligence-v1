/// <reference types="vitest/config" />
/**
 * STARTER-PACK DIRECTION RESCUE — NOT part of `npm test`.
 *
 * `starterPackDirectionRescue.test.ts` runs the owner Hardness -2 fixture through the
 * real bounded Engine search. It is the single most expensive file in the repository
 * and it asserts its own wall-clock budget, so it gets the same treatment
 * `recipeVectorProximity` already has: its own runner, with nothing else on it.
 *
 * WHY IT LEFT THE DEFAULT SUITE
 *
 *   Cost. Measured on the passing staging run 33345896110 (4-core GitHub runner):
 *   468.5 s of the suite's 955.7 s — 49 % of all test time for 8 tests, one of which
 *   alone runs 459 s. `vite.config.ts` sets `fileParallelism: false`, so the suite is
 *   strictly serial and this file is the critical path of the whole gate: `verify` has
 *   a p50 of 21.8 min over the last 102 passing runs. A longest-processing-time
 *   simulation over all 849 measured file durations puts the floor at 468.5 s no
 *   matter how many workers are used — this file, alone, IS the floor. Moving it to a
 *   lane of its own takes the two lanes to ~487 s and ~469 s of test time; they run
 *   concurrently, so the gate roughly halves.
 *
 *   Fidelity. Line 378 asserts `exactRuntimeMs + report.totalRuntimeMs < 15_000`.
 *   Observed across 20 CI runs: 7046-10131 ms, 47-68 % of the budget. That is a real
 *   assertion about the Direction search, and a shared runner makes it partly an
 *   assertion about whatever else is running. Isolation makes the measurement mean
 *   what it says.
 *
 * THE CONTRACTS ARE UNCHANGED. No threshold is raised, no test is skipped or rewritten,
 * and no solver code is touched. The file runs in full on every push and every PR — a
 * genuine regression still fails the build, here instead of there.
 *
 * No `testTimeout` is set below on purpose: the suite already declares its own
 * `vi.setConfig({ testTimeout: 600_000 })`, and a config-level value would silently
 * compete with it.
 *
 * Run it:
 *   npm run direction:rescue
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
    include: ['src/features/constraint-studio/starterPackDirectionRescue.test.ts'],
    // One file, one worker, nothing else competing — the point of the exercise.
    fileParallelism: false,
  },
});
