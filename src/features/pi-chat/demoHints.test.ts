import { describe, expect, it } from 'vitest';
import type { RedactedCorrectionProposal } from '@/engine';
import { advance, INITIAL_INTAKE, type IntakeEvent, type IntakeState } from './conversation';
import { buildDemoHints, mapProposalsToHints } from './demoHints';
import { intakeToRecipeInput } from './intakeToRecipe';
import type { ProductProfileId } from '@/data/productProfiles';
import type { ServingProfileId } from '@/data/servingProfiles';

const deepNumbers = (value: unknown, found: number[] = []): number[] => {
  if (typeof value === 'number') found.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepNumbers(v, found));
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((v) => deepNumbers(v, found));
  }
  return found;
};

const NAME_LEAKS = [
  'sucrose', 'dextrose', 'milk', 'cream', 'smp', 'raspberry', 'strawberry',
  'tara', 'inulin', 'banana', 'cocoa', 'chocolate', 'pistachio', 'whiskey', 'beam',
];

const intakeFor = (
  product: ProductProfileId,
  serving: ServingProfileId = 'display-minus-11',
): IntakeState => {
  const events: IntakeEvent[] = [
    { type: 'submitFlavor', text: 'flavor' },
    { type: 'chooseProductType', id: product },
    { type: 'chooseServingProfile', id: serving },
    { type: 'setBatch', keep: true },
  ];
  return events.reduce((state, event) => advance(state, event), INITIAL_INTAKE);
};

const redacted = (over: Partial<RedactedCorrectionProposal> = {}): RedactedCorrectionProposal => ({
  id: 'p',
  kind: 'correction',
  confidence: 'high',
  affected_metrics: ['pod'],
  direction: 'add',
  teaser_code: 'pro_can_calculate',
  ...over,
});

const ALL_PRODUCTS: ProductProfileId[] = ['gelato', 'sorbet', 'granita', 'vegan', 'protein'];

describe('mapProposalsToHints (pure, redacted → directional)', () => {
  it('maps area + direction + confidence with no numbers', () => {
    const hints = mapProposalsToHints([redacted({ affected_metrics: ['pod'], direction: 'add' })], false);
    expect(hints).toEqual([{ area: 'sweetness', direction: 'improve', confidence: 'high' }]);
    expect(deepNumbers(hints)).toEqual([]);
  });

  it('maps a freezing reduce-risk correction', () => {
    const hints = mapProposalsToHints(
      [redacted({ affected_metrics: ['npac'], direction: 'reduce', confidence: 'medium' })],
      false,
    );
    expect(hints).toEqual([{ area: 'freezing_stability', direction: 'reduce_risk', confidence: 'medium' }]);
  });

  it('a tradeoff on a hero-protected product reads as protect · main ingredient', () => {
    const hints = mapProposalsToHints(
      [redacted({ kind: 'tradeoff', affected_metrics: ['water'], direction: 'rebalance', confidence: 'tradeoff' })],
      true,
    );
    expect(hints[0]).toEqual({ area: 'main_ingredient', direction: 'protect', confidence: 'tradeoff' });
  });

  it('dedupes repeated areas', () => {
    const hints = mapProposalsToHints(
      [redacted({ affected_metrics: ['pod'] }), redacted({ id: 'p2', affected_metrics: ['pod'] })],
      false,
    );
    expect(hints).toHaveLength(1);
  });

  it('hints carry only the three label fields — no actions, no before/after', () => {
    const [hint] = mapProposalsToHints([redacted()], false);
    expect(Object.keys(hint!).sort()).toEqual(['area', 'confidence', 'direction']);
  });
});

describe('buildDemoHints (redacted demo, real solver)', () => {
  it('never throws — proves the solver runs in redacted mode', () => {
    for (const product of ALL_PRODUCTS) {
      expect(() => buildDemoHints(intakeFor(product))).not.toThrow();
    }
  });

  it('exposes ONLY the chosen batch size as a number — no recipe grams', () => {
    for (const product of ALL_PRODUCTS) {
      const view = buildDemoHints(intakeFor(product));
      expect(deepNumbers(view), product).toEqual([view.batchGrams]);
    }
  });

  it('leaks no ingredient names through the directional hints', () => {
    for (const product of ALL_PRODUCTS) {
      const view = buildDemoHints(intakeFor(product));
      const json = JSON.stringify(view.hints).toLowerCase();
      for (const leak of NAME_LEAKS) {
        expect(json, `${product} leak: ${leak}`).not.toContain(leak);
      }
    }
  });

  it('is product-aware and always runs on the −11°C Engine', () => {
    for (const product of ALL_PRODUCTS) {
      const view = buildDemoHints(intakeFor(product));
      expect(view.productProfileId).toBe(product);
      expect(view.engineLabel).toBe('−11°C Engine');
    }
    // calm pending note for the directions without a dedicated band yet
    expect(buildDemoHints(intakeFor('granita')).productPendingNote).not.toBeNull();
    expect(buildDemoHints(intakeFor('protein')).productPendingNote).not.toBeNull();
    expect(buildDemoHints(intakeFor('gelato')).productPendingNote).toBeNull();
  });

  it('future serving profiles stay a preview on the −11°C Engine', () => {
    // Owner decision (Slice C, AUDIT #19 / SPEC §11.2): 'storage-minus-18' is no longer
    // a serving profile; 'display-minus-13' is a real future serving cell — same
    // preview semantics (unconnected → still computed on the −11°C Engine).
    const view = buildDemoHints(intakeFor('gelato', 'display-minus-13'));
    expect(view.servingConnected).toBe(false);
    const input = intakeToRecipeInput(intakeFor('gelato', 'display-minus-13'))!;
    expect(input.target_temperature_c).toBe(-11);
    // the connected default is connected
    expect(buildDemoHints(intakeFor('gelato', 'display-minus-11')).servingConnected).toBe(true);
  });
});
