/**
 * §58 — the question is asked where it is real, and nowhere else.
 *
 * The failure this guards against is not a crash. It is a customer being stopped to
 * confirm something Gellatti already knows, which reads as the app not trusting its own
 * catalogue.
 */
import { describe, expect, it } from 'vitest';
import { decideUsageRole } from './homeUsageRoleDecision';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence/contracts';

const snapshot = (over: Partial<ProductBehaviorSnapshot>): ProductBehaviorSnapshot =>
  ({ schemaVersion: 1, lineId: 'l1', productId: 'p1', ...over }) as ProductBehaviorSnapshot;

describe('a product that answers for itself is never questioned', () => {
  it('base-only goes in as an ingredient', () => {
    const d = decideUsageRole(snapshot({ moduleEligibility: { BASE_RECIPE: 'eligible' } }));
    expect(d).toEqual({ kind: 'settled', role: 'ingredient' });
  });

  it('topping-only goes in as a topping', () => {
    const d = decideUsageRole(snapshot({ moduleEligibility: { TOPPING: 'eligible' } }));
    expect(d).toEqual({ kind: 'settled', role: 'topping' });
  });

  it('the server role TOPPING_ONLY settles it even with a silent module map', () => {
    const d = decideUsageRole(snapshot({ behaviorRole: 'TOPPING_ONLY' }));
    expect(d).toEqual({ kind: 'settled', role: 'topping' });
  });

  it('a blocked module is not an eligible one', () => {
    const d = decideUsageRole(
      snapshot({ moduleEligibility: { BASE_RECIPE: 'eligible', TOPPING: 'blocked' } }),
    );
    expect(d.kind).toBe('settled');
  });
});

describe('only a genuinely ambiguous product earns the question', () => {
  it('asks when the catalogue says BOTH', () => {
    const d = decideUsageRole(
      snapshot({ moduleEligibility: { BASE_RECIPE: 'eligible', TOPPING: 'eligible' } }),
    );
    expect(d).toEqual({ kind: 'ask' });
  });
});

describe('silence is not a question', () => {
  it('defaults to ingredient when the snapshot cannot say', () => {
    // A question the customer has no basis to answer is worse than a default they can
    // change; every row already offers "Zmień ilość" and a remove action.
    expect(decideUsageRole(snapshot({}))).toMatchObject({ kind: 'settled', role: 'ingredient' });
    expect(decideUsageRole(null)).toMatchObject({ kind: 'settled', role: 'ingredient' });
    expect(decideUsageRole(undefined)).toMatchObject({ kind: 'settled', role: 'ingredient' });
  });

  it('records WHY it defaulted, so the reason is not lost', () => {
    expect(decideUsageRole(null)).toMatchObject({ reason: 'unknown' });
  });
});
