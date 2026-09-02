import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import type { ConstraintPreview } from '@/features/constraint-studio/applyPipeline';
import type { RescueIngredientAdvice } from '@/features/constraint-studio/rescueIngredientAdvisor';
import type { StarterPackDirectionRescueReport } from '@/features/constraint-studio/starterPackDirectionRescue';
import type { DirectionFallbackReport } from '@/features/constraint-studio/directionFallback';
import {
  DirectionFallbackDecision,
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
    timing: {
      candidatePreparationMs: 1,
      productBehaviorMs: 1,
      solverSearchMs: 8,
      practicalizationScoringMs: 1,
      finalVerificationMs: 1,
    },
    budgetExhausted: false,
  });

  it('keeps technical Score separate from an unreached Direction and offers Preview, not Apply', () => {
    const html = renderToStaticMarkup(
      <StarterPackRescueDecision report={report(true)} pending={false} onOpen={vi.fn()} />,
    );
    expect(html).toContain('Zobacz propozycję');
    expect(html).not.toContain('Starter Pack');
    expect(html).not.toContain('Rescue');
    expect(html).not.toContain('Fruktoza');
    expect(html).not.toContain('Zastosuj zmiany');
  });

  it('renders a truthful working state and a closed-palette no-result state', () => {
    expect(renderToStaticMarkup(<StarterPackRescueDecision report={null} pending />)).toContain(
      'Sprawdzam inną możliwość',
    );
    expect(
      renderToStaticMarkup(<StarterPackRescueDecision report={report(false)} pending={false} />),
    ).toContain('Nie udało się znaleźć lepszego bezpiecznego wariantu.');
  });
});

describe('final simple Direction fallback UX', () => {
  const fallback = (level: -1 | 0): DirectionFallbackReport => {
    const proposedInput: RecipeInput = {
      ...starterMilkBase(),
      goals: {
        ...starterMilkBase().goals,
        direction_targets_active: true,
        direction_targets: { sweetness: 0, softness: level, creaminess: 0, flavor: 0 },
      },
    };
    return {
      requestedTargets: { sweetness: 0, softness: -2, creaminess: 0, flavor: 0 },
      attempts: [],
      best: {
        attemptIndex: level === -1 ? 0 : 1,
        targets: { sweetness: 0, softness: level, creaminess: 0, flavor: 0 },
        targetReached: true,
        runtimeMs: 5,
        preview: {
          ...candidate(),
          proposedInput,
          directionAssessment: {
            active: true,
            reached: true,
            supportedAxisCount: 2,
            reachedAxisCount: 2,
            score: 10,
            residuals: [],
            blockedAxes: [],
          },
        },
      },
      totalRuntimeMs: 5,
    };
  };

  const deep = (targetReached: boolean, withBest = true): StarterPackDirectionRescueReport => ({
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
          mapperId: 'PI-ING-000260',
          namePl: 'Cream Powder 42%',
          eligible: true,
          reason: 'candidate',
          bestGramsTested: 20,
          targetReached,
          npac: 34.9,
          pod: 16.6,
          score: 8,
          bandDistance: 8.7,
          totalRecipeMovement: 40,
          hardGates: 'PASS',
          mainPreserved: true,
          runtimeMs: 12,
          preview: candidate(),
        }
      : null,
    totalRuntimeMs: 12,
    timing: {
      candidatePreparationMs: 1,
      productBehaviorMs: 1,
      solverSearchMs: 8,
      practicalizationScoringMs: 1,
      finalVerificationMs: 1,
    },
    budgetExhausted: false,
  });

  const renderDecision = (
    fallbackReport: DirectionFallbackReport,
    alternativeReport: StarterPackDirectionRescueReport | null = null,
  ) =>
    renderToStaticMarkup(
      <DirectionFallbackDecision
        fallbackReport={fallbackReport}
        alternativeReport={alternativeReport}
        alternativePending={false}
        onUseFallback={vi.fn()}
        onTryAlternative={vi.fn()}
        onOpenAlternative={vi.fn()}
        onBack={vi.fn()}
      />,
    );

  it('shows exactly the compact −2 → −1 decision and approved three actions', () => {
    const html = renderDecision(fallback(-1));
    expect(html).toContain('Nie da się osiągnąć poziomu -2');
    expect(html).toContain('Najbliższy możliwy poziom to -1.');
    expect(html).toContain('Ustaw -1');
    expect(html).toContain('Spróbuj inaczej');
    expect(html).toContain('Wróć');
  });

  it('shows neutral only after the adjacent fallback failed', () => {
    const html = renderDecision(fallback(0));
    expect(html).toContain('Najbliższy możliwy poziom to 0.');
    expect(html).toContain('Ustaw 0');
    expect(html).toContain('Spróbuj inaczej');
  });

  it('shows an achieved alternative as a proposal without naming internal search or ingredients', () => {
    const html = renderDecision(fallback(-1), deep(true));
    expect(html).toContain('Można osiągnąć poziom -2');
    expect(html).toContain('Wymaga to zmiany receptury.');
    expect(html).toContain('Zobacz propozycję');
    expect(html).toContain('Zostań przy -1');
    expect(html).not.toContain('Cream Powder');
  });

  it('keeps a partially improved alternative truthful', () => {
    const html = renderDecision(fallback(-1), deep(false));
    expect(html).toContain('Można zbliżyć się bardziej do poziomu -2');
    expect(html).toContain('Zobacz propozycję');
    expect(html).toContain('Zostań przy -1');
  });

  it('ends a failed alternative cleanly with no repeated search action', () => {
    const html = renderDecision(fallback(-1), deep(false, false));
    expect(html).toContain('Poziomu -2 nie da się osiągnąć dla tej receptury');
    expect(html).toContain('Najbliższy bezpieczny poziom to -1.');
    expect(html).toContain('Ustaw -1');
    expect(html).not.toContain('Spróbuj inaczej');
  });

  it('never renders internal implementation vocabulary anywhere in the flow', () => {
    for (const html of [
      renderDecision(fallback(-1)),
      renderDecision(fallback(-1), deep(true)),
      renderDecision(fallback(-1), deep(false)),
      renderDecision(fallback(-1), deep(false, false)),
    ]) {
      expect(html).not.toMatch(
        /Starter Pack|Rescue|palette|candidate search|ProductBehavior search/i,
      );
    }
  });
});
