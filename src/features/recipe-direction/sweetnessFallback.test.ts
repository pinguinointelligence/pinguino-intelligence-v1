import { describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import { maySuggestVerifiedFructose, VERIFIED_FRUCTOSE_MAPPER_ID } from './sweetnessFallback';

const candidate = (side: 'below' | 'inside' | 'above', withFructose = false) => {
  const proposedInput = starterMilkBase();
  if (withFructose) {
    proposedInput.items[0] = {
      ...proposedInput.items[0]!,
      ingredient: {
        ...proposedInput.items[0]!.ingredient,
        canonical_ingredient_id: VERIFIED_FRUCTOSE_MAPPER_ID,
      },
    };
  }
  return {
    proposedInput,
    directionAssessment: {
      active: true,
      reached: side === 'inside',
      supportedAxisCount: 1,
      reachedAxisCount: side === 'inside' ? 1 : 0,
      score: side === 'inside' ? (10 as const) : (9 as const),
      residuals: [
        {
          axis: 'sweetness' as const,
          metric: 'pod' as const,
          reached: side === 'inside',
          side,
        },
      ],
      blockedAxes: [],
    },
  };
};

describe('verified Fructose sweetness fallback', () => {
  it('suggests an opt-in fallback only for an unresolved below-target sweetness', () => {
    expect(maySuggestVerifiedFructose(candidate('below'))).toBe(true);
    expect(maySuggestVerifiedFructose(candidate('inside'))).toBe(false);
    expect(maySuggestVerifiedFructose(candidate('above'))).toBe(false);
  });

  it('does not suggest a duplicate when verified Fructose is already present', () => {
    expect(maySuggestVerifiedFructose(candidate('below', true))).toBe(false);
  });
});
