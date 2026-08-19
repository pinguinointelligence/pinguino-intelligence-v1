import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import { DirectionBestDecision } from '@/features/pro-core/ProRecalcPanel';
import { VERIFIED_FRUCTOSE_MAPPER_ID } from './sweetnessFallback';

const preview = (side: 'below' | 'inside' | 'above', withFructose = false): ConstraintPreview => {
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
      score: side === 'inside' ? 10 : 9,
      residuals: [
        {
          axis: 'sweetness',
          metric: 'pod',
          reached: side === 'inside',
          side,
        },
      ],
      blockedAxes: [],
    },
  } as unknown as ConstraintPreview;
};

const render = (candidate: ConstraintPreview): string =>
  renderToStaticMarkup(
    <DirectionBestDecision candidate={candidate} onAccept={vi.fn()} onBack={vi.fn()} />,
  );

describe('closest-safe Fructose suggestion UI', () => {
  it('renders the manual, revalidated next step only for sweetness still below target', () => {
    const html = render(preview('below'));
    expect(html).toContain('data-testid="direction-best-fructose-suggestion"');
    expect(html).toContain('PI nie doda jej automatycznie');
    expect(html).toContain('twardość, zamrożenie, ciała stałe');
    expect(html).not.toContain(VERIFIED_FRUCTOSE_MAPPER_ID);
  });

  it.each([
    ['inside', false],
    ['above', false],
    ['below', true],
  ] as const)('does not render for %s / already-present=%s', (side, withFructose) => {
    expect(render(preview(side, withFructose))).not.toContain(
      'data-testid="direction-best-fructose-suggestion"',
    );
  });
});
