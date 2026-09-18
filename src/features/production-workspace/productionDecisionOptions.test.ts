/**
 * „Korekta partii” is written once for PRO Production and HOME production: the same four
 * options, the same words and the same recommendation rule.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_DECISION_ORDER,
  productionDecisionExplanation,
  productionDecisionOptions,
  productionDecisionTitle,
  recommendedProductionDecision,
} from './productionDecisionOptions';

describe('productionDecisionOptions', () => {
  const options = productionDecisionOptions({
    currentPlanMassG: 1000,
    plannedScore: 8,
    forecastScore: 6,
  });

  it('offers the four decisions in PRO order with PRO wording', () => {
    expect(options.map((option) => option.id)).toEqual([...PRODUCTION_DECISION_ORDER]);
    expect(options.map((option) => option.title)).toEqual([
      'Zachowaj 1000 g',
      'Zwiększ partię',
      'Przywróć oryginalną recepturę',
      'Kontynuuj bez korekty',
    ]);
    expect(options[3]!.explanation).toBe('Nie zmienimy dalszego planu. Przewidywany wynik: 8 → 6.');
    expect(
      productionDecisionOptions({
        currentPlanMassG: 1000,
        plannedScore: null,
        forecastScore: 6,
      })[3]!.explanation,
    ).toBe('Nie zmienimy dalszego planu.');
  });

  it('names the verified batch mass and Score once the authority previewed them', () => {
    expect(productionDecisionTitle(options[1]!, 1116)).toBe('Zwiększ partię do 1116 g');
    expect(productionDecisionTitle(options[2]!, 1116)).toBe(
      'Przywróć oryginalną recepturę · 1116 g',
    );
    expect(productionDecisionTitle(options[0]!, 1000)).toBe('Zachowaj 1000 g');
    expect(productionDecisionTitle(options[1]!, null)).toBe('Zwiększ partię');
    expect(productionDecisionExplanation(options[3]!, 8, 7)).toBe(
      'Nie zmienimy dalszego planu. Przewidywany wynik: 8 → 7.',
    );
    expect(productionDecisionExplanation(options[0]!, 8, 7)).toBe(options[0]!.explanation);
  });

  it('recommends continuing only at a safe 10/10, otherwise the first available option', () => {
    expect(
      recommendedProductionDecision({
        keep_original_batch: { scoreDisplay: '9/10' },
        leave_as_is: { scoreDisplay: '10/10' },
      }),
    ).toBe('leave_as_is');
    expect(
      recommendedProductionDecision({
        keep_original_batch: null,
        enlarge_batch: { scoreDisplay: '8/10' },
        leave_as_is: { scoreDisplay: '7/10' },
      }),
    ).toBe('enlarge_batch');
    expect(recommendedProductionDecision({})).toBeUndefined();
  });
});
