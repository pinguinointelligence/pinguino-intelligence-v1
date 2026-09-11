import { describe, expect, it } from 'vitest';
import { hasBaseIdea, shouldOfferRecipeCta } from './homeComposerGate';

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
