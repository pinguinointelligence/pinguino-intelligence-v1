/**
 * CONTROLLED ±2 RELAXATION — THE POLICY, PROVEN AS A POLICY
 * (owner decision 2026-09-19 „GLOBAL ±2 CONTROLLED RELAXATION", test classes
 * A–N of § 18; the matrix across profiles and machine families is § 17 and
 * lives in `controlledRelaxation.matrix.test.ts`).
 *
 * Every assertion here is about the SHARED rule, never about one ingredient,
 * one profile or one machine. Where a concrete registered range is needed the
 * test asks the REGISTRY which lines it governs rather than naming anything.
 */
import { describe, expect, it } from 'vitest';
import { calculateRecipe, detectViolations, type RecipeInput } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { buildDraftCandidateVector } from '@/features/constraint-studio/draftCandidateVector';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import drafts from '@/features/constraint-studio/__fixtures__/directionFalseInfeasibleDrafts.json';
import { ownerInulinPolicyIssues } from '@/features/product-intelligence/ownerInulinPolicy';
import {
  directionRelaxationPermitted,
  extendedGramBand,
  normalizedRangeExcursion,
  permittedGramBand,
  EXTENDED_RANGE_LOWER_FACTOR,
  EXTENDED_RANGE_UPPER_FACTOR,
} from './directionRelaxation';
import {
  RELAXATION_SCORE_PENALTY_CAP,
  relaxableOwnerRanges,
  relaxationCost,
  relaxationScorePenalty,
  relaxedOwnerRanges,
  withExtendedRelaxableRanges,
} from './relaxableRangePolicy';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';

type CaseKey = keyof typeof drafts;
const draftFor = (key: CaseKey) =>
  drafts[key] as unknown as { input: RecipeInput; constraints: ConstraintSet };

const AT = '2026-09-19T00:00:00.000Z';

/** A draft carrying a registered relaxable range, found by ASKING the registry. */
const governedDraft = (): { input: RecipeInput; constraints: ConstraintSet; lineId: string } => {
  const { input, constraints } = draftFor('LOCK-02a');
  const ranges = relaxableOwnerRanges(input);
  expect(ranges.length).toBeGreaterThan(0);
  return { input, constraints, lineId: ranges[0]!.lineIds[0]! };
};

/** The same draft with the governed line moved to `grams`, batch preserved. */
const withGovernedGrams = (input: RecipeInput, lineId: string, grams: number): RecipeInput => {
  const line = input.items.find((item) => item.id === lineId)!;
  const delta = grams - line.planned_grams;
  // Give the difference back to the largest OTHER line so the batch still holds.
  const donor = [...input.items]
    .filter((item) => item.id !== lineId)
    .sort((a, b) => b.planned_grams - a.planned_grams)[0]!;
  return {
    ...input,
    items: input.items.map((item) =>
      item.id === lineId
        ? { ...item, planned_grams: grams }
        : item.id === donor.id
          ? { ...item, planned_grams: item.planned_grams - delta }
          : item,
    ),
  };
};

const atLevel = (input: RecipeInput, sweetness: -2 | -1 | 0 | 1 | 2): RecipeInput => ({
  ...input,
  goals: {
    ...input.goals,
    direction_targets_active: true,
    direction_targets: { sweetness, softness: 0, creaminess: 0, flavor: 0 },
  },
});

describe('§18 A — RANGE IS NOT LOCK', () => {
  it('a movable `range` line participates in the search, bounded by its interval', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    const movable = input.items.find(
      (item) =>
        item.lock_type === 'unlocked' && item.actual_grams === null && item.planned_grams > 20,
    )!;
    const band = { minGrams: movable.planned_grams - 10, maxGrams: movable.planned_grams + 10 };
    const banded: ConstraintSet = {
      byLineId: {
        ...constraints.byLineId,
        [movable.id]: { mode: 'range', minGrams: band.minGrams, maxGrams: band.maxGrams },
      },
    };
    const candidate = buildDraftCandidateVector(input, banded, new Set()).find(
      (entry) => entry.lineId === movable.id,
    );
    expect(candidate).toBeDefined();
    for (const grams of candidate!.testedGrams) {
      expect(grams).toBeGreaterThanOrEqual(band.minGrams - 1e-9);
      expect(grams).toBeLessThanOrEqual(band.maxGrams + 1e-9);
    }
    expect(candidate!.testedGrams).toContain(band.minGrams);
    expect(candidate!.testedGrams).toContain(band.maxGrams);
  });

  it('a `locked` line is still held, and a `percent` line too — a hold is a hold', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    const line = input.items.find(
      (item) => item.lock_type === 'unlocked' && item.planned_grams > 20,
    )!;
    for (const held of [
      { mode: 'locked' as const, grams: line.planned_grams },
      { mode: 'percent' as const, percent: 10 },
    ]) {
      const set: ConstraintSet = { byLineId: { ...constraints.byLineId, [line.id]: held } };
      expect(
        buildDraftCandidateVector(input, set, new Set()).some((c) => c.lineId === line.id),
      ).toBe(false);
    }
  });
});

describe('§18 C — ±1 NEVER EXPANDS, ±2 MAY', () => {
  it('the extended envelope is available at ±2 only', () => {
    const { input } = governedDraft();
    for (const level of [-1, 0, 1] as const) {
      expect(directionRelaxationPermitted(atLevel(input, level))).toBe(false);
    }
    for (const level of [-2, 2] as const) {
      expect(directionRelaxationPermitted(atLevel(input, level))).toBe(true);
    }
  });

  it('an inactive Direction request never permits relaxation, whatever the numbers say', () => {
    const { input } = governedDraft();
    const asleep: RecipeInput = {
      ...atLevel(input, 2),
      goals: { ...atLevel(input, 2).goals, direction_targets_active: false },
    };
    expect(directionRelaxationPermitted(asleep)).toBe(false);
  });

  it('the permitted band at ±1 IS the normal band; at ±2 it is the extended one', () => {
    const { input } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    expect(permittedGramBand(atLevel(input, 1), normal)).toEqual(normal);
    expect(permittedGramBand(atLevel(input, 2), normal)).toEqual(extendedGramBand(normal));
  });
});

describe('§18 E — THE 50 % BOUNDARY, AND NO FURTHER', () => {
  it('each boundary extends by 50 % of its own value', () => {
    expect(extendedGramBand({ minGrams: 20, maxGrams: 80 })).toEqual({
      minGrams: 10,
      maxGrams: 120,
    });
    expect(extendedGramBand({ minGrams: 100, maxGrams: 200 })).toEqual({
      minGrams: 50,
      maxGrams: 300,
    });
    expect(EXTENDED_RANGE_LOWER_FACTOR).toBe(0.5);
    expect(EXTENDED_RANGE_UPPER_FACTOR).toBe(1.5);
  });

  it('the extension NEVER compounds — one normal range, one extreme range', () => {
    const normal = { minGrams: 20, maxGrams: 80 };
    const once = extendedGramBand(normal);
    const { input } = governedDraft();
    const widenedTwice = withExtendedRelaxableRanges(
      atLevel(input, 2),
      withExtendedRelaxableRanges(atLevel(input, 2), {
        byLineId: {
          [relaxableOwnerRanges(input)[0]!.lineIds[0]!]: { mode: 'range', ...normal },
        },
      }),
    );
    const widenedOnce = withExtendedRelaxableRanges(atLevel(input, 2), {
      byLineId: { [relaxableOwnerRanges(input)[0]!.lineIds[0]!]: { mode: 'range', ...normal } },
    });
    expect(widenedTwice).toEqual(widenedOnce);
    const line = widenedOnce.byLineId[relaxableOwnerRanges(input)[0]!.lineIds[0]!];
    expect(line).toEqual({ mode: 'range', minGrams: once.minGrams, maxGrams: once.maxGrams });
  });

  it('a value beyond the extreme band is outside the policy, on both sides', () => {
    const normal = { minGrams: 20, maxGrams: 80 };
    expect(normalizedRangeExcursion(120, normal)).toBeCloseTo(1, 9);
    expect(normalizedRangeExcursion(121, normal)).toBeGreaterThan(1);
    expect(normalizedRangeExcursion(10, normal)).toBeCloseTo(1, 9);
    expect(normalizedRangeExcursion(9, normal)).toBeGreaterThan(1);
  });
});

describe('§18 F / G / H / I — a controlled excursion is VALID, priced, and proportional', () => {
  it('F: at ±2 a dose outside the normal band but inside the emergency band is NOT a breach', () => {
    const { input, lineId } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    const beyondNormal = normal.maxGrams + (normal.maxGrams * 0.5) / 2; // mid-emergency
    const relaxed = withGovernedGrams(atLevel(input, 2), lineId, beyondNormal);
    expect(ownerInulinPolicyIssues(relaxed)).toEqual([]);
    // …and at ±1 the very same recipe IS a breach, because nothing was permitted.
    expect(ownerInulinPolicyIssues(withGovernedGrams(atLevel(input, 1), lineId, beyondNormal)))
      .not.toEqual([]);
  });

  it('F: beyond the emergency band it is a breach again, even at ±2', () => {
    const { input, lineId } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    const beyondEmergency = extendedGramBand(normal).maxGrams + 5;
    expect(ownerInulinPolicyIssues(withGovernedGrams(atLevel(input, 2), lineId, beyondEmergency)))
      .not.toEqual([]);
  });

  it('G: a relaxed recipe scores lower than the otherwise-equivalent unrelaxed one', () => {
    const { input, lineId } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    const inside = withGovernedGrams(atLevel(input, 2), lineId, normal.maxGrams);
    const outside = withGovernedGrams(atLevel(input, 2), lineId, normal.maxGrams * 1.19);
    expect(relaxationScorePenalty(inside)).toBe(0);
    expect(relaxationScorePenalty(outside)).toBeGreaterThan(0);
    const insideScore = recipeFitForInput(inside).score;
    const outsideScore = recipeFitForInput(outside).score;
    if (insideScore !== null && outsideScore !== null) {
      expect(outsideScore).toBeLessThanOrEqual(insideScore);
    }
  });

  it('H / I: the normalized excursion is proportional on BOTH sides of the band', () => {
    const normal = { minGrams: 20, maxGrams: 80 };
    const above = [81, 90, 100, 110, 120].map((g) => normalizedRangeExcursion(g, normal));
    for (let i = 1; i < above.length; i += 1) expect(above[i]!).toBeGreaterThan(above[i - 1]!);
    const below = [19, 17, 15, 12, 10].map((g) => normalizedRangeExcursion(g, normal));
    for (let i = 1; i < below.length; i += 1) expect(below[i]!).toBeGreaterThan(below[i - 1]!);
    // Inside the band there is no excursion at all — neither edge is an excursion.
    for (const grams of [20, 35, 50, 80]) expect(normalizedRangeExcursion(grams, normal)).toBe(0);
  });

  it('H: the same relative excursion costs the same on a different band — normalized, not grams', () => {
    expect(normalizedRangeExcursion(90, { minGrams: 20, maxGrams: 80 })).toBeCloseTo(
      normalizedRangeExcursion(225, { minGrams: 100, maxGrams: 200 }),
      9,
    );
  });
});

describe('§18 M / N — the penalty is conservative, bounded and never doubled', () => {
  it('M: a recipe inside every owner band pays nothing at all', () => {
    const { input, lineId } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    for (const grams of [normal.minGrams, (normal.minGrams + normal.maxGrams) / 2, normal.maxGrams]) {
      const inside = withGovernedGrams(atLevel(input, 2), lineId, grams);
      expect(relaxedOwnerRanges(inside)).toEqual([]);
      expect(relaxationCost(inside)).toBe(0);
      expect(relaxationScorePenalty(inside)).toBe(0);
    }
  });

  it('N: one controlled excursion costs ONE point, and nothing ever costs more than the cap', () => {
    const { input, lineId } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    const extended = extendedGramBand(normal);
    // A modest excursion is worth exactly one point — an ideality signal.
    expect(
      relaxationScorePenalty(
        withGovernedGrams(atLevel(input, 2), lineId, normal.maxGrams + (extended.maxGrams - normal.maxGrams) * 0.2),
      ),
    ).toBe(1);
    // Even at the very edge of what the policy permits it stays at the cap …
    for (const share of [0.5, 0.9, 1]) {
      const grams = normal.maxGrams + (extended.maxGrams - normal.maxGrams) * share;
      const penalty = relaxationScorePenalty(withGovernedGrams(atLevel(input, 2), lineId, grams));
      expect(penalty).toBeGreaterThanOrEqual(1);
      expect(penalty).toBeLessThanOrEqual(RELAXATION_SCORE_PENALTY_CAP);
    }
    // … and the cap is small enough that a valid emergency result never looks defective.
    expect(RELAXATION_SCORE_PENALTY_CAP).toBeLessThanOrEqual(2);
  });

  it('N: the continuous cost keeps the proportionality the integer cannot show', () => {
    const { input, lineId } = governedDraft();
    const normal = relaxableOwnerRanges(input)[0]!.normal;
    const extended = extendedGramBand(normal);
    const costs = [0.1, 0.3, 0.6, 1].map((share) =>
      relaxationCost(
        withGovernedGrams(
          atLevel(input, 2),
          lineId,
          normal.maxGrams + (extended.maxGrams - normal.maxGrams) * share,
        ),
      ),
    );
    for (let i = 1; i < costs.length; i += 1) expect(costs[i]!).toBeGreaterThan(costs[i - 1]!);
    expect(costs[costs.length - 1]!).toBeLessThanOrEqual(1);
  });
});

describe('§18 J / K / L — hard authorities win, and the fallback is the nearest legal result', () => {
  const solve = (input: RecipeInput, constraints: ConstraintSet) =>
    buildOptimizePreview(input, constraints, AT, {
      requirePracticalPreview: true,
      directionFallbackPass: true,
      skipRescueAssessment: true,
    });

  it('J: an explicit hard lock is immovable even during a ±2 request', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    const extreme = atLevel(input, 2);
    const frozen: ConstraintSet = {
      byLineId: Object.fromEntries(
        extreme.items.map((item) => [
          item.id,
          { mode: 'locked' as const, grams: item.planned_grams },
        ]),
      ),
    };
    const result = solve(extreme, { byLineId: { ...constraints.byLineId, ...frozen.byLineId } });
    if (!result.ok) {
      expect(result.code).toBeTruthy();
      return;
    }
    for (const item of result.preview.proposedInput.items) {
      const before = extreme.items.find((line) => line.id === item.id)!;
      expect(item.planned_grams).toBe(before.planned_grams);
    }
  });

  it('K: a physically impossible request stays impossible — the batch cannot fit the machine', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    const impossible: RecipeInput = { ...atLevel(input, 2), machine_capacity_grams: 50 };
    const result = solve(impossible, constraints);
    if (!result.ok) return; // an honest refusal is a pass
    expect(
      detectViolations(calculateRecipe(result.preview.proposedInput)).length === 0,
    ).toBe(true);
  });

  it('L: when the target stays unreachable the result is the nearest LEGAL one, marked honestly', () => {
    const { input, constraints } = draftFor('LOCK-02a');
    const result = solve(atLevel(input, 2), constraints);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const proposed = result.preview.proposedInput;
    // Legal, on batch, and never published as reached when it is not.
    expect(detectViolations(calculateRecipe(proposed))).toEqual([]);
    expect(
      Math.abs(proposed.items.reduce((sum, item) => sum + item.planned_grams, 0) -
        proposed.target_batch_grams),
    ).toBeLessThan(0.5);
    // Whatever envelope produced it, an excursion beyond the POLICY is impossible.
    for (const range of relaxableOwnerRanges(proposed)) {
      expect(range.normalizedExcursion).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});
