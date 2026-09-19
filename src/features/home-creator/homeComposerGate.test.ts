import { describe, expect, it } from 'vitest';
import { hasBaseIdea, shouldOfferRecipeCta, startCtaEnabled } from './homeComposerGate';

describe('DESIGN V3.0 VI/IX — when „Rozpocznij recepturę” is active', () => {
  const idea = (chips: { role: 'topping' | 'ingredient' | null }[], typedText = false) =>
    startCtaEnabled({ mode: 'idea', chips, typedText, recipeChosen: false });

  it('is inactive on the empty idea screen', () => {
    expect(idea([])).toBe(false);
  });

  it('is active for a base idea chip', () => {
    expect(idea([{ role: null }])).toBe(true);
  });

  it('is active for text typed in the field (the CTA turns it into chips first)', () => {
    expect(idea([], true)).toBe(true);
  });

  it('stays inactive for a topping alone', () => {
    expect(idea([{ role: 'topping' }])).toBe(false);
  });

  it('in „Receptury” follows the chosen recipe only, never the idea chips', () => {
    expect(
      startCtaEnabled({
        mode: 'library',
        chips: [{ role: null }],
        typedText: true,
        recipeChosen: false,
      }),
    ).toBe(false);
    expect(
      startCtaEnabled({ mode: 'library', chips: [], typedText: false, recipeChosen: true }),
    ).toBe(true);
  });
});

describe('§28 — when the HOME call to action exists', () => {
  it('does not exist on the empty screen', () => {
    expect(shouldOfferRecipeCta([])).toBe(false);
  });

  it('exists once one base ingredient is described', () => {
    expect(shouldOfferRecipeCta([{ role: null }])).toBe(true);
  });

  it('exists for an explicitly stated base ingredient', () => {
    expect(shouldOfferRecipeCta([{ role: 'ingredient' }])).toBe(true);
  });

  it('does NOT exist for a topping alone — a decoration is not a recipe', () => {
    expect(shouldOfferRecipeCta([{ role: 'topping' }])).toBe(false);
  });

  it('does not exist for several toppings either', () => {
    expect(shouldOfferRecipeCta([{ role: 'topping' }, { role: 'topping' }])).toBe(false);
  });

  it('exists as soon as a base joins the toppings', () => {
    expect(shouldOfferRecipeCta([{ role: 'topping' }, { role: null }])).toBe(true);
  });

  it('disappears again when the last base idea is removed', () => {
    const withBase = [{ role: null as null }, { role: 'topping' as const }];
    expect(shouldOfferRecipeCta(withBase)).toBe(true);
    expect(shouldOfferRecipeCta(withBase.slice(1))).toBe(false);
  });

  it('hasBaseIdea is the same question, named for reuse', () => {
    expect(hasBaseIdea([{ role: 'topping' }])).toBe(false);
    expect(hasBaseIdea([{ role: 'ingredient' }])).toBe(true);
  });
});
