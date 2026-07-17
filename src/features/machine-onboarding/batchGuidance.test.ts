/**
 * Soft recommended-batch guidance (OWNER FINAL DECISION, 2026-07-17).
 *
 * Logic-level pins for owner tests 5–10: the recommendation is a soft
 * starting proposal — lower and higher amounts are both legitimate states
 * (never a block), the above-recommendation warning carries three
 * non-blocking choices, and the optional split is EVEN.
 */
import { describe, expect, it } from 'vitest';
import { deriveBatchGuidance } from './batchGuidance';

describe('deriveBatchGuidance — soft proposal, never a block', () => {
  it('no machine recommendation → nothing to guide', () => {
    expect(deriveBatchGuidance({ recommendedGrams: null, currentGrams: 700, choice: 'undecided' }))
      .toEqual({ kind: 'none' });
    expect(deriveBatchGuidance({ recommendedGrams: 450, currentGrams: null, choice: 'undecided' }))
      .toEqual({ kind: 'none' });
  });

  it('the recommendation itself is quietly active', () => {
    expect(deriveBatchGuidance({ recommendedGrams: 450, currentGrams: 450, choice: 'undecided' }))
      .toEqual({ kind: 'recommended_active' });
  });

  it('OWNER TEST 6 — a LOWER amount is a legitimate custom state (marker + restore only)', () => {
    expect(deriveBatchGuidance({ recommendedGrams: 450, currentGrams: 300, choice: 'undecided' }))
      .toEqual({ kind: 'custom', recommendedGrams: 450 });
  });

  it('OWNER TEST 7 — a HIGHER amount warns but never blocks (three choices open)', () => {
    const g = deriveBatchGuidance({ recommendedGrams: 450, currentGrams: 1000, choice: 'undecided' });
    expect(g).toMatchObject({ kind: 'custom_above', recommendedGrams: 450, choice: 'undecided' });
    if (g.kind !== 'custom_above') throw new Error('expected custom_above');
    expect(g.split).toBeNull(); // split is OPTIONAL — only after the user chooses it
  });

  it('OWNER TEST 10 — choosing the split yields the EVEN plan (1000 @ 450 → 3 × ~333.3)', () => {
    const g = deriveBatchGuidance({ recommendedGrams: 450, currentGrams: 1000, choice: 'split' });
    if (g.kind !== 'custom_above') throw new Error('expected custom_above');
    expect(g.split).toEqual({
      containers: 3,
      gramsPerContainer: 333.3,
      totalGrams: 1000,
      withinSingleContainer: false,
    });
  });

  it('OWNER TEST 8 — „Pozostaw moją ilość" keeps the exact amount (state carried, no plan forced)', () => {
    const g = deriveBatchGuidance({ recommendedGrams: 450, currentGrams: 1000, choice: 'keep_mine' });
    expect(g).toMatchObject({ kind: 'custom_above', choice: 'keep_mine', split: null });
  });
});
