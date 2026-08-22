import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import type { RescueIngredientAdvice } from '@/features/constraint-studio/rescueIngredientAdvisor';
import { DirectionBestDecision, RescueAdviceHint } from '@/features/pro-core/ProRecalcPanel';

const candidate = (): ConstraintPreview =>
  ({
    proposedInput: starterMilkBase(),
    directionAssessment: {
      active: true,
      reached: false,
      supportedAxisCount: 2,
      reachedAxisCount: 0,
      score: 8,
      residuals: [
        { axis: 'sweetness', metric: 'pod', reached: false, side: 'below' },
        { axis: 'softness', metric: 'npac', reached: false, side: 'below' },
      ],
      blockedAxes: [],
    },
  }) as unknown as ConstraintPreview;

const advice = (): RescueIngredientAdvice => ({
  candidate: {
    canonicalIngredientId: 'PI-ING-000456',
    namePl: 'Inulina',
    ingredient: findDemoIngredient('inulin')!,
    source: 'formulation_toolbox',
  },
  current: { score: 8, reachedAxisCount: 0, supportedAxisCount: 2, severityPoints: 6.7 },
  rescue: { score: 9, reachedAxisCount: 1, supportedAxisCount: 2, severityPoints: 3.2 },
  simulatedGrams: 95,
  reasonPl:
    'Z obecnymi składnikami najlepszy wynik to 8/10. Dodanie składnika „Inulina” pozwala Engine osiągnąć lepszy legalny profil (9/10, symulacja 95 g).',
  simulatedCandidateIds: ['PI-ING-000456'],
});

describe('rescue ingredient advice UI (simulation-proven, never auto-add)', () => {
  it('renders the proven next step with its truthful reason and the manual add instruction', () => {
    const html = renderToStaticMarkup(
      <DirectionBestDecision
        candidate={candidate()}
        onAccept={vi.fn()}
        onBack={vi.fn()}
        rescueAdvice={advice()}
        onAddRescueIngredient={vi.fn()}
      />,
    );
    expect(html).toContain('data-testid="direction-rescue-advice"');
    expect(html).toContain('Możliwy kolejny krok: Inulina');
    expect(html).toContain('8/10');
    expect(html).toContain('9/10');
    expect(html).toContain('PI nie doda tego składnika automatycznie');
    expect(html).toContain('data-testid="direction-rescue-add-ingredient"');
    expect(html).toContain('Najbliższy poprawny wynik: 8/10');
  });

  it('renders nothing when the advisor has no proven recommendation (no heuristic fallback)', () => {
    const html = renderToStaticMarkup(
      <DirectionBestDecision candidate={candidate()} onAccept={vi.fn()} onBack={vi.fn()} />,
    );
    expect(html).not.toContain('data-testid="direction-rescue-advice"');
    expect(html).not.toContain('Możliwy kolejny krok');
    expect(html).not.toContain('fruktoz');
    expect(renderToStaticMarkup(<RescueAdviceHint advice={null} />)).toBe('');
  });
});
