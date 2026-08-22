import { describe, expect, it } from 'vitest';

import { calculateRecipe } from '@/engine';
import { buildOptimizePreview } from '@/features/constraint-studio/applyPipeline';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { recipeTechnicalFit } from '@/features/recipe-score';

import { assessRecipeDirection } from './recipeDirectionAssessment';

const directed = () => {
  const base = starterMilkBase();
  return {
    ...base,
    goals: {
      ...base.goals,
      direction_targets_active: true,
      direction_targets: {
        sweetness: 2 as const,
        softness: 2 as const,
        creaminess: 0 as const,
        flavor: 0 as const,
      },
    },
  };
};

describe('one canonical public fit includes supported Recipe Direction targets', () => {
  it('preserves the accepted native technical score when Direction is inactive', () => {
    const input = starterMilkBase();
    const result = calculateRecipe(input);
    expect(recipeFitForInput(input, result)).toEqual(recipeTechnicalFit(result));
  });

  it('reserves 10/10 for native safety plus every supported selected axis reached', () => {
    const input = directed();
    const result = calculateRecipe(input);
    const assessment = assessRecipeDirection(input, result);
    const fit = recipeFitForInput(input, result);

    expect(recipeTechnicalFit(result).score).toBe(10);
    expect(assessment.supportedAxisCount).toBe(2);
    expect(assessment.reached).toBe(false);
    expect(fit.score).toBe(assessment.score);
    expect(fit.score).toBeLessThan(10);
    expect(fit.ariaText).toContain('Kierunek receptury');
  });

  it('uses the same fit after the normal deterministic Preview candidate', () => {
    const input = directed();
    const built = buildOptimizePreview(input, { byLineId: {} }, '2026-08-10T00:00:00.000Z');
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const result = calculateRecipe(built.preview.proposedInput);
    const assessment = assessRecipeDirection(built.preview.proposedInput, result);
    const fit = recipeFitForInput(built.preview.proposedInput, result);

    expect(fit.score).toBeLessThanOrEqual(10);
    expect(fit.score).toBeGreaterThanOrEqual(1);
    expect(fit.score).toBe(
      Math.min(recipeTechnicalFit(result).score ?? 10, assessment.score ?? 10),
    );
  });
});
