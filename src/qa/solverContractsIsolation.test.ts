/// <reference types="node" />
/**
 * The solver time contract must be RUN, and must be run ALONE.
 *
 * Two failure modes this guards against, and the second is the dangerous one:
 *
 *  1. the heavy file drifts back into the default suite, so `npm test` measures
 *     contention instead of the solver — the original defect;
 *  2. the file is excluded but the dedicated job matches NOTHING and passes
 *     vacuously — a green build that verifies nothing at all, which is strictly
 *     worse than the flake it replaced.
 *
 * The 5000 ms contract itself is not this test's business and is deliberately not
 * referenced here: this is about WHERE the contract runs, never about how hard it is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const HEAVY_FILE = 'src/features/constraint-studio/recipeVectorProximity.test.ts';
const DEDICATED_CONFIG = 'vitest.solver-contracts.config.ts';

describe('the heavy solver file is out of the default suite', () => {
  it('is excluded in the default vitest config', () => {
    expect(read('vite.config.ts')).toContain(HEAVY_FILE);
  });

  it('still exists — exclusion must never become deletion', () => {
    expect(read(HEAVY_FILE).length).toBeGreaterThan(0);
  });
});

describe('the harness allowance is scoped, and is not a performance gate', () => {
  it('gives the dedicated suite an explicit timeout', () => {
    expect(read(DEDICATED_CONFIG)).toMatch(/testTimeout: 30_000/);
  });

  it('does NOT change the global default for the other ~10 000 tests', () => {
    // The allowance exists because shared CI hardware is slower, not because any
    // test may now be slow. Everything else keeps Vitest's 5000 ms default.
    expect(read('vite.config.ts')).not.toContain('testTimeout');
  });

  it('keeps termination guaranteed structurally, not by the clock', () => {
    // Audited 2026-08-30: the suite asserts nothing about elapsed time — Vitest
    // merely killed it at the default. Termination is proven by bounded search and
    // iteration caps, which have their own tests, so raising the harness allowance
    // removes no correctness guarantee.
    const suite = read(HEAVY_FILE);
    for (const timing of ['performance.now', 'hrtime', 'toBeLessThan(5000)']) {
      expect(suite, timing).not.toContain(timing);
    }
  });
});

describe('…and is still actually executed by its own job', () => {
  it('has a dedicated config that INCLUDES it', () => {
    const config = read(DEDICATED_CONFIG);
    expect(config).toContain(`include: ['${HEAVY_FILE}']`);
  });

  it('has an npm script pointing at that config', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['solver:contracts']).toContain(DEDICATED_CONFIG);
  });

  it('is invoked by the CI job through that script, not a bare path', () => {
    const workflow = read('.github/workflows/ci.yml');
    expect(workflow).toContain('npm run solver:contracts');
    // A bare `vitest run <path>` would honour the exclusion and match nothing.
    expect(workflow).not.toMatch(
      /vitest run src\/features\/constraint-studio\/recipeVectorProximity/,
    );
  });

  it('keeps the dedicated job on its own runner, with nothing else in it', () => {
    const workflow = read('.github/workflows/ci.yml');
    const job = workflow.slice(workflow.indexOf('solver-contracts:'));
    expect(job).toContain('runs-on:');
    // The whole point: this job must not also run the application suite.
    expect(job).not.toContain('npm test');
    expect(job).not.toContain('npm run build');
  });
});
