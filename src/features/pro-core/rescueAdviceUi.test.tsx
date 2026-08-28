import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import type { RescueIngredientAdvice } from '@/features/constraint-studio/rescueIngredientAdvisor';
import type { StarterPackDirectionRescueReport } from '@/features/constraint-studio/starterPackDirectionRescue';
import {
  DirectionBestDecision,
  RescueAdviceHint,
  StarterPackRescueDecision,
} from '@/features/pro-core/ProRecalcPanel';

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
  trigger: 'direction',
  candidate: {
    canonicalIngredientId: 'PI-ING-000456',
    namePl: 'Inulina',
    ingredient: findDemoIngredient('inulin')!,
    source: 'formulation_toolbox',
  },
  current: {
    score: 8,
    reachedAxisCount: 0,
    supportedAxisCount: 2,
    severityPoints: 6.7,
    hardMetricCount: 0,
    engineSeverityPoints: 0,
  },
  rescue: {
    score: 9,
    reachedAxisCount: 1,
    supportedAxisCount: 2,
    severityPoints: 3.2,
    hardMetricCount: 0,
    engineSeverityPoints: 0,
  },
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
    expect(html).toContain('Gellatti nie doda tego składnika automatycznie');
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

describe('Starter Pack Direction Rescue decision UI', () => {
  const report = (withBest: boolean): StarterPackDirectionRescueReport => ({
    palette: [
      'PI-ING-000494',
      'PI-ING-000496',
      'PI-ING-000456',
      'PI-ING-001645',
      'PI-ING-000270',
      'PI-ING-000260',
      'PI-ING-002114',
    ],
    records: [],
    best: withBest
      ? {
          mapperId: 'PI-ING-000496',
          namePl: 'Fruktoza',
          eligible: true,
          reason: 'candidate',
          bestGramsTested: 20,
          targetReached: false,
          npac: 34,
          pod: 17,
          score: 10,
          bandDistance: 2,
          totalRecipeMovement: 40,
          hardGates: 'PASS',
          mainPreserved: true,
          runtimeMs: 12,
          preview: candidate(),
        }
      : null,
    totalRuntimeMs: 12,
  });

  it('keeps technical Score separate from an unreached Direction and offers Preview, not Apply', () => {
    const html = renderToStaticMarkup(
      <StarterPackRescueDecision report={report(true)} pending={false} onOpen={vi.fn()} />,
    );
    expect(html).toContain('Wynik techniczny: 10/10');
    expect(html).toContain('cel kierunku: nieosiągnięty');
    expect(html).toContain('nie udało się osiągnąć wybranego celu');
    expect(html).toContain('najbliższa bezpieczna opcja');
    expect(html).toContain('Sprawdź z fruktozą');
    expect(html).not.toContain('Zastosuj zmiany');
  });

  it('renders a truthful working state and a closed-palette no-result state', () => {
    expect(renderToStaticMarkup(<StarterPackRescueDecision report={null} pending />)).toContain(
      'Sprawdzam pojedynczo produkty Gellatti Starter Pack',
    );
    expect(
      renderToStaticMarkup(<StarterPackRescueDecision report={report(false)} pending={false} />),
    ).toContain(
      'Z obecnych składników ani produktów Gellatti Starter Pack nie udało się osiągnąć wybranego celu.',
    );
  });
});
