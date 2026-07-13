import { describe, expect, it } from 'vitest';
import { INGREDIENT_FORMS, isIngredientForm, requiresFormSelection } from './contracts';

/**
 * Orchestrator extension of Agent A's form contract (owner spec #8/#9):
 *  - the offered forms are the seven świeża / mrożona / puree / pasta / suszona /
 *    ekstrakt / napar (adds mrożona + puree), still dose-free;
 *  - fruit (Malina / truskawka …) is form-eligible, like herbs — a customer buys it
 *    as fresh / frozen / purée, so it must pick a form before a product.
 */
describe('ingredient form contract (extended)', () => {
  it('offers the seven owner-approved forms, including mrożona + puree', () => {
    const ids = INGREDIENT_FORMS.map((f) => f.id);
    expect(ids).toEqual(['swieza', 'mrozona', 'puree', 'pasta', 'suszona', 'ekstrakt', 'napar']);
    expect(ids.every(isIngredientForm)).toBe(true);
  });

  it('makes fruit form-eligible (Malina / truskawka / mango) as well as herbs', () => {
    for (const name of ['Malina', 'maliną', 'Puree malinowe', 'Truskawka', 'Mango', 'Bazylia', 'Mięta']) {
      expect(requiresFormSelection(name)).toBe(true);
    }
  });

  it('does NOT ask a form for a brand ingredient (Czekolada / Whisky)', () => {
    expect(requiresFormSelection('Czekolada')).toBe(false);
    expect(requiresFormSelection('Whisky')).toBe(false);
  });
});
