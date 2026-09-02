/**
 * OWNER-LOCKED — GEL-P0-024. A suite lifted out of `npm test` keeps running,
 * alone, and keeps asserting what it asserted.
 *
 * Two suites are deliberately excluded from the default run and given a CI lane of
 * their own — `recipeVectorProximity` (PR #40) and `starterPackDirectionRescue`
 * (PR #52). Both exclusions were made for the same two reasons: the file dominated
 * a strictly serial suite, and it is observed under a wall-clock budget that a
 * shared runner turns into a measurement of contention.
 *
 * That arrangement has a failure mode with no natural alarm. If an exclusion
 * survives but its lane stops matching the file — a renamed path, a dropped
 * `include`, a job deleted in a workflow cleanup, a bare `vitest run <path>` that
 * silently honours the very exclusion it means to bypass — the lane goes GREEN
 * having executed NOTHING. Unlike a deleted test, nothing turns red. The default
 * suite cannot notice either, because the file is legitimately absent from it.
 *
 * So this contract locks the pair, not the file: excluded HERE **and** executed
 * THERE, with the dedicated job carrying nothing else that could compete with it.
 *
 * Purely additive. It fixes no threshold and no duration: how long either suite may
 * take, and how hard its budget is, are deliberately not this contract's business —
 * only WHERE each one runs and THAT it still runs. `src/qa/solverContractsIsolation.test.ts`
 * keeps the detailed enforcement; this is the immutable core of it, placed here so it
 * runs inside the required 30-second gate rather than an 11-minute one.
 *
 * Evidence: `reports/CI_GATE_CRITICAL_PATH.md`, `reports/CI_SOLVER_TIMING_FORENSICS.md`.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SRC_ROOT, withoutComments } from './sourceContract';

/** Repository root — these artefacts live beside `src/`, not inside it. */
const REPO_ROOT = resolve(SRC_ROOT, '..');
const read = (...parts: string[]) => readFileSync(join(REPO_ROOT, ...parts), 'utf8');
/** Comments are stripped so a mention in a docstring can never satisfy a contract. */
const readCode = (...parts: string[]) => withoutComments(read(...parts));

const WORKFLOW = join('.github', 'workflows', 'ci.yml');

/**
 * Each lane, and the wall-clock budget it exists to observe honestly. A budget of
 * `null` means the suite asserts no elapsed time at all — audited 2026-08-30 for
 * `recipeVectorProximity`, whose 5000 ms was only Vitest's default.
 */
const LANES = [
  {
    id: 'solver time contract',
    file: 'src/features/constraint-studio/recipeVectorProximity.test.ts',
    config: 'vitest.solver-contracts.config.ts',
    script: 'solver:contracts',
    job: 'solver-contracts',
    assertion: null,
  },
  {
    id: 'starter-pack Direction rescue',
    file: 'src/features/constraint-studio/starterPackDirectionRescue.test.ts',
    config: 'vitest.direction-rescue.config.ts',
    script: 'direction:rescue',
    job: 'direction-rescue',
    assertion: 'expect(exactRuntimeMs + report.totalRuntimeMs).toBeLessThan(15_000)',
  },
] as const;

/** One job's body: from its key to the next top-level job key. */
const jobBody = (workflow: string, job: string) => {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  expect(start, `job ${job} is declared in ci.yml`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};

describe.each(LANES)('GEL-P0-024 · $id — excluded here', (lane) => {
  it('is excluded from the default suite', () => {
    expect(readCode('vite.config.ts')).toContain(lane.file);
  });

  it('still exists — exclusion must never become deletion', () => {
    expect(read(lane.file).length).toBeGreaterThan(0);
  });
});

describe.each(LANES)('GEL-P0-024 · $id — and executed there', (lane) => {
  it('has a dedicated config that includes exactly it', () => {
    expect(readCode(lane.config)).toContain(`include: ['${lane.file}']`);
  });

  it('runs alone inside that config', () => {
    // A second file in the lane would reintroduce the contention the lane exists
    // to remove.
    expect(readCode(lane.config)).toContain('fileParallelism: false');
  });

  it('has an npm script pointing at that config', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts[lane.script]).toContain(lane.config);
  });

  it('is invoked by its CI job through that script, never a bare path', () => {
    const job = jobBody(read(WORKFLOW), lane.job);
    expect(job).toContain(`npm run ${lane.script}`);
    // The vacuity trap: a bare `vitest run <path>` honours the exclusion above and
    // matches nothing, so the lane passes having verified nothing at all.
    expect(job).not.toMatch(new RegExp(`vitest run\\s+${lane.file.replace(/[./]/g, '\\$&')}`));
  });

  it('keeps that job on its own runner, with nothing else in it', () => {
    const job = jobBody(read(WORKFLOW), lane.job);
    expect(job).toContain('runs-on:');
    expect(job).not.toContain('npm test');
    expect(job).not.toContain('npm run build');
  });
});

describe('GEL-P0-024 · isolation may never become relaxation', () => {
  it.each(LANES.filter((lane) => lane.assertion !== null))(
    '$id keeps its own wall-clock assertion',
    (lane) => {
      // Moving a suite to a quieter runner is allowed BECAUSE the budget stays; a
      // lane that dropped the assertion would measure nothing precisely where the
      // measurement was said to matter.
      expect(readCode(lane.file)).toContain(lane.assertion!);
    },
  );

  it('grants no harness allowance to the other ~10 000 tests', () => {
    // Per-suite allowances are scoped to their own config or their own `it`.
    // A global default here would silently relax every test in the repository.
    expect(readCode('vite.config.ts')).not.toContain('testTimeout');
  });
});
