import { describe, expect, it, vi } from 'vitest';
import type { RecipeDirectionTarget, RecipeInput } from '@/engine';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { BuildPreviewResult, ConstraintPreview } from './applyPipeline';
import {
  buildDirectionFallback,
  directionFallbackTargetSequence,
  shouldRunDirectionFallback,
} from './directionFallback';

const NONE = { byLineId: {} } as const;

const withHardness = (
  target: RecipeDirectionTarget,
  sweetness: RecipeDirectionTarget = 0,
): RecipeInput => {
  const input = starterMilkBase();
  return {
    ...input,
    goals: {
      ...input.goals,
      direction_targets_active: true,
      direction_targets: { sweetness, softness: target, creaminess: 0, flavor: 0 },
    },
  };
};

const resultFor = (fallbackInput: RecipeInput, reached: boolean): BuildPreviewResult =>
  ({
    ok: true,
    preview: {
      kind: 'optimize',
      diagnosticOnly: false,
      proposedInput: fallbackInput,
      directionAssessment: {
        active: true,
        reached,
        supportedAxisCount: 2,
        reachedAxisCount: reached ? 2 : 1,
        score: reached ? 10 : 9,
        residuals: [],
        blockedAxes: [],
      },
    } as unknown as ConstraintPreview,
  }) as BuildPreviewResult;

describe('bounded adjacent Direction fallback', () => {
  it('maps −2 to −1 then 0, −1 to 0, +2 to +1 then 0, and +1 to 0', () => {
    expect(
      directionFallbackTargetSequence(withHardness(-2)).map((entry) => entry.softness),
    ).toEqual([-1, 0]);
    expect(
      directionFallbackTargetSequence(withHardness(-1)).map((entry) => entry.softness),
    ).toEqual([0]);
    expect(directionFallbackTargetSequence(withHardness(2)).map((entry) => entry.softness)).toEqual(
      [1, 0],
    );
    expect(directionFallbackTargetSequence(withHardness(1)).map((entry) => entry.softness)).toEqual(
      [0],
    );
  });

  it('stops after −1 succeeds and never calculates 0', () => {
    const input = withHardness(-2);
    const evaluateCandidate = vi.fn(({ fallbackInput }) => resultFor(fallbackInput, true));
    const report = buildDirectionFallback({
      input,
      set: NONE,
      createdAt: '2026-08-28T12:00:00.000Z',
      normalResult: { ok: false, code: 'no_proposal' },
      evaluateCandidate,
    });

    expect(evaluateCandidate).toHaveBeenCalledTimes(1);
    expect(report.best?.targets.softness).toBe(-1);
    expect(report.attempts.map((entry) => entry.targets.softness)).toEqual([-1]);
  });

  it('tries 0 only after −1 fails', () => {
    const input = withHardness(-2);
    const evaluateCandidate = vi.fn(({ fallbackInput, attemptIndex }) =>
      resultFor(fallbackInput, attemptIndex === 1),
    );
    const report = buildDirectionFallback({
      input,
      set: NONE,
      createdAt: '2026-08-28T12:00:00.000Z',
      normalResult: { ok: false, code: 'unsafe_proposal' },
      evaluateCandidate,
    });

    expect(evaluateCandidate).toHaveBeenCalledTimes(2);
    expect(report.attempts.map((entry) => entry.targets.softness)).toEqual([-1, 0]);
    expect(report.best?.targets.softness).toBe(0);
  });

  it('stops after +1 succeeds and tries 0 only if +1 fails', () => {
    const plusOne = buildDirectionFallback({
      input: withHardness(2),
      set: NONE,
      createdAt: '2026-08-28T12:00:00.000Z',
      normalResult: { ok: false, code: 'no_proposal' },
      evaluateCandidate: ({ fallbackInput }) => resultFor(fallbackInput, true),
    });
    expect(plusOne.attempts.map((entry) => entry.targets.softness)).toEqual([1]);

    const neutral = buildDirectionFallback({
      input: withHardness(2),
      set: NONE,
      createdAt: '2026-08-28T12:00:00.000Z',
      normalResult: { ok: false, code: 'no_proposal' },
      evaluateCandidate: ({ fallbackInput, attemptIndex }) =>
        resultFor(fallbackInput, attemptIndex === 1),
    });
    expect(neutral.attempts.map((entry) => entry.targets.softness)).toEqual([1, 0]);
    expect(neutral.best?.targets.softness).toBe(0);
  });

  it('never mutates Direction, ingredient grams, Main/Multi-Main, locks, or batch while probing', () => {
    const input = withHardness(-2, 1);
    const before = structuredClone(input);
    const sequences = directionFallbackTargetSequence(input);

    expect(input).toEqual(before);
    expect(sequences).toHaveLength(2);
    expect(sequences).toEqual([
      { sweetness: 0, softness: -1, creaminess: 0, flavor: 0 },
      { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
    ]);
    expect(input.items).toEqual(before.items);
    expect(input.target_batch_grams).toBe(before.target_batch_grams);
  });

  it('runs only after exact current-ingredient Direction is genuinely unreached', () => {
    const input = withHardness(-2);
    expect(shouldRunDirectionFallback(input, { ok: false, code: 'no_proposal' })).toBe(true);
    expect(shouldRunDirectionFallback(input, { ok: false, code: 'blocked_science' })).toBe(false);
    const reached = resultFor(input, true);
    expect(shouldRunDirectionFallback(input, reached)).toBe(false);
  });
});
