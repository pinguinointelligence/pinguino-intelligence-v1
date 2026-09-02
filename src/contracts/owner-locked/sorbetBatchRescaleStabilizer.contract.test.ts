/**
 * OWNER-LOCKED — PC-02. A batch change may not manufacture an
 * authority-invalid Sorbet stabilizer system.
 *
 * Purely additive; it weakens no existing contract and no stabilizer limit.
 *
 * The originally recorded PC-02 claim — "the Solver raises the stabilizer
 * system above the ceiling" — is rejected by evidence. The Solver never raises
 * it: the recorded 34 g exemplar was assembled as a `RecipeInput` directly and
 * is not reachable, because `addIngredient` and the gram editor both clamp
 * through `clampSorbetStabilizerComponentGrams`.
 *
 * What IS reachable is the batch itself. `resizeRecipeBatch` scales every
 * flexible line by one proportional factor, and the stabilizer system cannot
 * travel that way: its ceiling is a PERCENTAGE that rounds INWARD to whole
 * grams. A legal 5 g system at 1000 g became 1.34 g + 2.01 g at 670 g — the
 * Ninja CREAMi Deluxe capacity — which is both fractional and above the 3 g
 * ceiling that batch derives.
 *
 * This contract locks the shape of the repair, not a number: the projection
 * must come from `SORBET_STABILIZER_SYSTEM_POLICY` via
 * `sorbetStabilizerWholeGramBand`, so no literal gram figure can become a
 * second business rule. `recipeStore.sorbetStabilizerRescale.test.ts` locks the
 * customer-reachable half through the store's own doors.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { RecipeInput } from '@/engine';
import {
  SORBET_STABILIZER_SYSTEM_POLICY,
  assessSorbetStabilizerSystem,
  planSorbetStabilizerSystemRescale,
  sorbetStabilizerWholeGramBand,
} from '@/features/recipe-constraints';

const line = (id: string, grams: number) => ({
  id,
  ingredient: { ...findDemoIngredient('tara_gum')!, id, canonical_ingredient_id: id },
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked' as const,
});

const recipe = (
  batch: number,
  grams: readonly number[],
  category: RecipeInput['category'] = 'sorbet',
) => ({
  mode: 'classic' as const,
  category,
  target_temperature_c: -11,
  target_batch_grams: batch,
  machine_capacity_grams: null,
  items: grams.map((value, index) => line(`gum-${index + 1}`, value)),
});

/** What one proportional factor produces — the state PC-02 must not keep. */
const proportional = (batch: number, next: number, grams: readonly number[]) =>
  recipe(next, grams.map((value) => (value * next) / batch));

const planned = (batch: number, next: number, grams: readonly number[]) => {
  const plan = planSorbetStabilizerSystemRescale(
    recipe(batch, grams),
    proportional(batch, next, grams),
  );
  return plan === null ? null : [...plan.values()];
};

describe('OWNER-LOCKED — batch rescale keeps the Sorbet stabilizer system canonical', () => {
  it('1. the four owner-named batches land whole, inside the derived band', () => {
    for (const [next, expected] of [
      [670, [1, 2]],
      [500, [1, 1]],
      [250, [0, 1]],
      [2000, [4, 6]],
    ] as const) {
      const grams = planned(1_000, next, [2, 3]);
      expect(grams).toEqual([...expected]);
      const total = grams!.reduce((sum, value) => sum + value, 0);
      expect(total).toBeLessThanOrEqual(sorbetStabilizerWholeGramBand(next).maxGrams);
      expect(grams!.every(Number.isInteger)).toBe(true);
      expect(assessSorbetStabilizerSystem(recipe(next, grams!)).issues).toEqual([]);
    }
  });

  it('2. scaling UP is never clamped down to the preferred total', () => {
    // 2 g + 3 g at 1000 g is legal at the ceiling; at 2000 g the ceiling
    // doubles with it. Pulling the system to the preferred 8 g here would be
    // destructive, not corrective.
    expect(planned(1_000, 2_000, [2, 3])).toEqual([4, 6]);
    expect(sorbetStabilizerWholeGramBand(2_000).preferredGrams).toBe(8);
  });

  it('3. an already-invalid system is never handed mass it did not have', () => {
    // 1 g at 1000 g is below the minimum. Doubling the batch must not invent
    // the missing grams — that repair belongs to the customer or to Przelicz.
    const grams = planned(1_000, 2_000, [1]);
    expect(grams).toEqual([2]);
    expect(grams![0]).toBeLessThan(sorbetStabilizerWholeGramBand(2_000).minGrams);
  });

  it('4. nothing is invented, nothing goes negative, no component appears', () => {
    for (const next of [250, 500, 670, 1_000, 1_430, 1_900, 2_000, 37]) {
      const grams = planned(1_000, next, [2, 3]);
      expect(grams).toHaveLength(2);
      for (const value of grams!) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('5. it declines to act where it has no authority', () => {
    // Not a Sorbet: the Gelato system has its own policy and is out of scope.
    expect(
      planSorbetStabilizerSystemRescale(
        recipe(1_000, [2, 3], 'milk_gelato'),
        { ...proportional(1_000, 670, [2, 3]), category: 'milk_gelato' as const },
      ),
    ).toBeNull();
    // A Sorbet carrying no stabilizer line is left exactly as it is.
    expect(planSorbetStabilizerSystemRescale(recipe(1_000, []), recipe(670, []))).toBeNull();
  });

  it('6. every limit is derived from the policy percentage — no literal rule', () => {
    for (const [batch, maxGrams] of [
      [250, 1],
      [500, 2],
      [670, 3],
      [1_000, 5],
      [1_430, 7],
      [1_900, 9],
      [2_000, 10],
    ] as const) {
      expect(sorbetStabilizerWholeGramBand(batch).maxGrams).toBe(maxGrams);
      expect(Math.floor((batch * SORBET_STABILIZER_SYSTEM_POLICY.maxPercent) / 100)).toBe(maxGrams);
    }
  });

  it('7. neither the projection nor the store writes a gram ceiling of its own', () => {
    /* The projection deliberately lives BESIDE the authority rather than inside
       it: `sorbetStabilizerSystemAuthority.ts` is part of the security-reviewed
       Production Rescue Edge source closure (GEL-P0-018), and a Studio-side
       repair has no business enlarging that closure. It owns no limit of its
       own — every number still comes from the authority it imports. */
    const projection = readFileSync(
      'src/features/recipe-constraints/sorbetStabilizerRescaleProjection.ts',
      'utf8',
    );
    expect(projection).toContain('sorbetStabilizerWholeGramBand');
    expect(projection).toContain("from './sorbetStabilizerSystemAuthority'");
    // Only the whole-gram arithmetic may carry numerals; no percentage and no
    // gram ceiling may be restated here.
    const code = projection.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/\b0\.[0-9]+\b/);
    expect(code.match(/\b[2-9][0-9]*\b/g) ?? []).toEqual([]);

    const store = readFileSync('src/stores/recipeStore.ts', 'utf8');
    const helper = store.slice(
      store.indexOf('const rescaleWithOwnerStabilizerSystem'),
      store.indexOf('/** Snapshot of a preset as fresh store state'),
    );
    const helperCode = helper.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(helperCode).toContain('planSorbetStabilizerSystemRescale');
    // `0` is an emptiness check, never a limit; any other numeral would be one.
    expect(helperCode.match(/\b[1-9][0-9]*\b/g) ?? []).toEqual([]);
  });

  it('8. the Apply-door authority stays the final check', () => {
    // The projection is a repair, not a replacement for validation: a system
    // outside the band is still reported by the authority itself.
    expect(assessSorbetStabilizerSystem(recipe(670, [4])).issues).toEqual([
      expect.objectContaining({ code: 'aggregate_above_maximum', maxGrams: 3 }),
    ]);
    expect(assessSorbetStabilizerSystem(recipe(670, [1.5, 1.5])).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'component_not_whole_grams' })]),
    );
  });
});
