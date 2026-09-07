import { describe, expect, it } from 'vitest';
// The Node-only seed helper is intentionally plain ESM and executed by both
// this runtime test and the seed generator.
// @ts-expect-error Node .mjs helper has no application bundle declaration.
import { assertSaturatedFatWasNotInvented } from '../../scripts/lib/ingredientSourceGuards.mjs';

describe('Mapper import saturated-fat source guard', () => {
  const headers = ['ingredient_id', 'saturated_fat_percent', 'engine_notes'];

  it('preserves missing as missing and a documented zero as zero', () => {
    expect(() =>
      assertSaturatedFatWasNotInvented(headers, [
        ['PI-MISSING', '', 'Saturated fat was not present in the source.'],
        ['PI-ZERO', '0', 'Exact manufacturer label: saturated fat 0 g / 100 g.'],
      ]),
    ).not.toThrow();
  });

  it('rejects a placeholder zero invented from an absent source field', () => {
    expect(() =>
      assertSaturatedFatWasNotInvented(headers, [
        ['PI-BAD', '0', 'Saturated fat was not present in the source.'],
      ]),
    ).toThrow(/Preserve NULL\/UNKNOWN/);
  });
});
