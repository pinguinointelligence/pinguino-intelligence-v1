/**
 * §8 „I changed something here" — the change marker is a PURE comparison.
 *
 * These proofs pin the two properties the owner asked for: every editable
 * ingredient value participates (grams/%, lock, Main role, required,
 * unavailable, price, substitution), and nothing is ever marked before there is
 * an accepted state to compare against.
 */
import { describe, expect, it } from 'vitest';
import {
  changedIngredientLineIds,
  ingredientChangeSignature,
  type IngredientChangeInput,
} from './ingredientChangeHighlight';

const line = (overrides: Partial<IngredientChangeInput> = {}): IngredientChangeInput => ({
  lineId: 'line-1',
  plannedGrams: 670,
  lockType: 'unlocked',
  role: 'standard',
  required: false,
  unavailable: false,
  pricePerKg: 0.9,
  priceSource: 'mapper',
  ingredientId: 'milk_3_5',
  ...overrides,
});

describe('ingredientChangeSignature', () => {
  it('is stable for an unchanged line', () => {
    expect(ingredientChangeSignature(line())).toBe(ingredientChangeSignature(line()));
  });

  it.each([
    ['grams (and therefore the displayed %)', { plannedGrams: 671 }],
    ['an exclusive lock', { lockType: 'grams' }],
    ['the Main crown', { role: 'main' }],
    ['required status', { required: true }],
    ['unavailable status', { unavailable: true }],
    ['the effective price', { pricePerKg: 1.1 }],
    ['switching to the owner’s own price', { priceSource: 'customer_override' }],
    ['a substituted product', { ingredientId: 'milk_1_5' }],
  ])('changes when %s changes', (_label, patch) => {
    expect(ingredientChangeSignature(line(patch as Partial<IngredientChangeInput>))).not.toBe(
      ingredientChangeSignature(line()),
    );
  });

  it('ignores float noise below the displayed precision', () => {
    expect(ingredientChangeSignature(line({ plannedGrams: 670.00001 }))).toBe(
      ingredientChangeSignature(line()),
    );
  });
});

describe('changedIngredientLineIds', () => {
  const baseline = { a: 'sig-a', b: 'sig-b' } as const;

  it('marks nothing on a cold start — there is no accepted state yet', () => {
    expect([...changedIngredientLineIds({ a: 'sig-a', b: 'different' }, {})]).toEqual([]);
  });

  it('marks only the lines that differ from the accepted state', () => {
    expect([...changedIngredientLineIds({ a: 'sig-a', b: 'edited' }, baseline)]).toEqual(['b']);
  });

  it('marks a newly added line', () => {
    expect([...changedIngredientLineIds({ a: 'sig-a', c: 'sig-c' }, baseline)]).toEqual(['c']);
  });

  it('marks nothing once the state matches the baseline again', () => {
    expect([...changedIngredientLineIds({ a: 'sig-a', b: 'sig-b' }, baseline)]).toEqual([]);
  });
});
