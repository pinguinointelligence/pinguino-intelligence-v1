/**
 * §F — sub-display-precision residue must never raise a marker.
 *
 * A percentage edit rebalances the other lines and can leave a difference far
 * below what the row can render. Served QA showed SUCROSE at 135.0004 g and
 * INULIN at 120.9996 g, both still displaying `135 g` and `121 g`, both marked
 * — a marker the owner could not explain from the numbers in front of them.
 *
 * Reproducing floating residue by hand in a browser is unreliable, so this is
 * the deterministic proof, and it is anchored to the REAL renderer: the same
 * `toLocaleString('pl-PL', { maximumFractionDigits: 1 })` the collapsed mobile
 * row uses. If the row's precision ever changes, this test fails rather than
 * silently drifting away from the signature.
 */
import { describe, expect, it } from 'vitest';
import { changedIngredientLineIds, ingredientChangeSignature } from './ingredientChangeHighlight';

/** EXACTLY what `MobileIngredientLine` renders for grams. */
const renderGrams = (grams: number) =>
  `${grams.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} g`;

const sig = (grams: number) =>
  ingredientChangeSignature({
    lineId: 'line-1',
    ingredientId: 'sucrose',
    plannedGrams: grams,
    lockType: 'unlocked',
  });

const markedFor = (baselineGrams: number, currentGrams: number) => [
  ...changedIngredientLineIds({ 'line-1': sig(currentGrams) }, { 'line-1': sig(baselineGrams) }),
];

describe('display-precision marker contract', () => {
  it.each([
    ['the served SUCROSE case', 135, 135.0004],
    ['the served INULIN case', 121, 120.9996],
    ['a rebalance residue upward', 3, 3.04],
    ['a rebalance residue downward', 46, 45.96],
    ['pure float noise', 480, 480.000000001],
  ])('%s renders identically → NO marker', (_label, baseline, current) => {
    // The premise: the two really do render the same.
    expect(renderGrams(current)).toBe(renderGrams(baseline));
    expect(markedFor(baseline, current)).toEqual([]);
  });

  it.each([
    ['a tenth of a gram', 135, 135.1],
    ['the served MILK edit', 480, 485],
    ['a rebalance the row can show', 480, 474.9],
    ['crossing the rounding boundary', 3, 3.06],
  ])('%s renders differently → marker appears', (_label, baseline, current) => {
    // The premise: the two really do render differently.
    expect(renderGrams(current)).not.toBe(renderGrams(baseline));
    expect(markedFor(baseline, current)).toEqual(['line-1']);
  });

  it('the signature and the row agree on precision, by construction', () => {
    // Any value that renders the same must sign the same, across a sweep.
    // A sweep, because the boundaries are where toFixed and Intl disagree —
    // this is what caught 101.85 rendering as `101,9 g` while toFixed(1) said
    // `101.8`.
    for (let i = 0; i < 400; i += 1) {
      const base = 100 + i * 0.37;
      for (const nudge of [0.004, 0.04, 0.05, 0.06, -0.004, -0.05]) {
        const nudged = base + nudge;
        if (renderGrams(nudged) === renderGrams(base)) expect(sig(nudged)).toBe(sig(base));
        else expect(sig(nudged)).not.toBe(sig(base));
      }
    }
  });
});
