/**
 * §8 „I changed something here" — the change marker is a PURE comparison.
 *
 * These proofs pin what the owner ruled on 2026-08-24: the marker compares the
 * RECIPE VECTOR only, at the precision the row shows, and nothing is ever
 * marked before there is an accepted state to compare against.
 */
import { describe, expect, it } from 'vitest';
import {
  changedIngredientLineIds,
  ingredientChangeSignature,
  type IngredientChangeInput,
} from './ingredientChangeHighlight';

const line = (overrides: Partial<IngredientChangeInput> = {}): IngredientChangeInput => ({
  lineId: 'line-1',
  ingredientId: 'milk_3_5',
  plannedGrams: 670,
  lockType: 'unlocked',
  ...overrides,
});

describe('ingredientChangeSignature', () => {
  it('is stable for an unchanged line', () => {
    expect(ingredientChangeSignature(line())).toBe(ingredientChangeSignature(line()));
  });

  it.each([
    ['grams (and therefore the displayed %)', { plannedGrams: 671 }],
    ['an exclusive lock', { lockType: 'grams' }],
    ['the Main crown, which lives on the lock', { lockType: 'main' }],
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

  it('compares at the precision the row SHOWS, so an invisible residue is not marked', () => {
    // Served staging QA: a percentage edit rebalanced the other lines and left
    // SUCROSE at 135.0004 g and INULIN at 120.9996 g. Both rows still displayed
    // 135 g and 121 g, so marking them was unexplainable to the owner.
    expect(ingredientChangeSignature(line({ plannedGrams: 135.0004 }))).toBe(
      ingredientChangeSignature(line({ plannedGrams: 135 })),
    );
    expect(ingredientChangeSignature(line({ plannedGrams: 120.9996 }))).toBe(
      ingredientChangeSignature(line({ plannedGrams: 121 })),
    );
    // A difference the row can actually show is still a change.
    expect(ingredientChangeSignature(line({ plannedGrams: 135.4 }))).not.toBe(
      ingredientChangeSignature(line({ plannedGrams: 135 })),
    );
  });

  it('carries NO asynchronously hydrated value — the marker cannot be moved by a fetch', () => {
    // Owner ruling: recipe-state only. The owner's „MOJA CENA" arrives after
    // first paint; served QA lit up 4–5 own-priced lines three separate times
    // while the signature still carried a price.
    const signature = ingredientChangeSignature(line());
    expect(signature.split('|')).toHaveLength(3);
    expect(signature).toBe('milk_3_5|670.0|unlocked');
    for (const leaked of ['EUR', 'mapper_reference', 'customer_override', 'req', 'unavail'])
      expect(signature, leaked).not.toContain(leaked);
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
