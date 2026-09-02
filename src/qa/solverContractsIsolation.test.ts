/// <reference types="node" />
/**
 * An isolated suite must be RUN, and must be run ALONE.
 *
 * Two files are deliberately excluded from `npm test` and given a runner of their own.
 * Two failure modes this guards against, and the second is the dangerous one:
 *
 *  1. a heavy file drifts back into the default suite, so `npm test` measures
 *     contention instead of the thing under test — the original defect;
 *  2. the file is excluded but the dedicated job matches NOTHING and passes
 *     vacuously — a green build that verifies nothing at all, which is strictly
 *     worse than the flake it replaced.
 *
 * How hard any contract is, is not this test's business: this is about WHERE each
 * suite runs, never about the thresholds it asserts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), 'utf8');

const WORKFLOW = '.github/workflows/ci.yml';

/**
 * Every suite that has been lifted out of the default run onto a lane of its own.
 * Adding a row here is the whole cost of isolating another file — the proofs below
 * then apply to it automatically.
 */
const ISOLATED = [
  {
    label: 'solver time contract',
    file: 'src/features/constraint-studio/recipeVectorProximity.test.ts',
    config: 'vitest.solver-contracts.config.ts',
    script: 'solver:contracts',
    job: 'solver-contracts',
  },
  {
    label: 'starter-pack Direction rescue',
    file: 'src/features/constraint-studio/starterPackDirectionRescue.test.ts',
    config: 'vitest.direction-rescue.config.ts',
    script: 'direction:rescue',
    job: 'direction-rescue',
  },
] as const;

/** The body of one workflow job: from its key to the next top-level job key. */
const jobBody = (workflow: string, job: string) => {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  expect(start, `job ${job} is declared`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe.each(ISOLATED)('$label — is out of the default suite', (suite) => {
  it('is excluded in the default vitest config', () => {
    expect(read('vite.config.ts')).toContain(suite.file);
  });

  it('still exists — exclusion must never become deletion', () => {
    expect(read(suite.file).length).toBeGreaterThan(0);
  });
});

describe.each(ISOLATED)('$label — …and is still actually executed', (suite) => {
  it('has a dedicated config that INCLUDES it', () => {
    expect(read(suite.config)).toContain(`include: ['${suite.file}']`);
  });

  it('has an npm script pointing at that config', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts[suite.script]).toContain(suite.config);
  });

  it('is invoked by the CI job through that script, not a bare path', () => {
    const workflow = read(WORKFLOW);
    expect(workflow).toContain(`npm run ${suite.script}`);
    // A bare `vitest run <path>` would honour the exclusion and match nothing.
    expect(workflow).not.toMatch(new RegExp(`vitest run ${suite.file.replace(/[./]/g, '\\$&')}`));
  });

  it('keeps the dedicated job on its own runner, with nothing else in it', () => {
    const job = jobBody(read(WORKFLOW), suite.job);
    expect(job).toContain('runs-on:');
    expect(job).toContain(`npm run ${suite.script}`);
    // The whole point: this job must not also run the application suite.
    expect(job).not.toContain('npm test');
    expect(job).not.toContain('npm run build');
  });

  it('runs the isolated file with nothing else beside it', () => {
    // `fileParallelism: false` on a one-file include is what makes "alone" true
    // rather than merely "in a different job".
    expect(read(suite.config)).toContain('fileParallelism: false');
  });
});

describe('the solver harness allowance is scoped, and is not a performance gate', () => {
  it('gives the dedicated suite an explicit timeout', () => {
    expect(read('vitest.solver-contracts.config.ts')).toMatch(/testTimeout: 30_000/);
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
    const suite = read('src/features/constraint-studio/recipeVectorProximity.test.ts');
    for (const timing of ['performance.now', 'hrtime', 'toBeLessThan(5000)']) {
      expect(suite, timing).not.toContain(timing);
    }
  });
});

describe('the Direction rescue lane defers to the suite’s own declared timeout', () => {
  it('sets no competing config-level timeout', () => {
    // The file declares `vi.setConfig({ testTimeout: 600_000 })` itself; a second
    // value in the config would silently race it.
    // Precisely: it must not SET one. Naming it in a comment is fine — explaining the
    // omission is the point.
    expect(read('vitest.direction-rescue.config.ts')).not.toMatch(/^\s*testTimeout\s*:/m);
    expect(read('src/features/constraint-studio/starterPackDirectionRescue.test.ts')).toContain(
      'vi.setConfig({ testTimeout: 600_000 })',
    );
  });

  it('still asserts its own wall-clock budget, unchanged', () => {
    // Isolation exists to make this measurement honest — never to relax it.
    expect(read('src/features/constraint-studio/starterPackDirectionRescue.test.ts')).toContain(
      'expect(exactRuntimeMs + report.totalRuntimeMs).toBeLessThan(15_000)',
    );
  });
});
