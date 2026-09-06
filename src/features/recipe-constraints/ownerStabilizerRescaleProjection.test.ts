/**
 * The batch-rescale whole-gram projection, bound to the OWNER authority.
 *
 * PC-02 proved the algorithm for Sorbet. Wiring only the Sorbet helpers into
 * `rescaleWithOwnerStabilizerSystem` left every Gelato category holding
 * fractional stabilizer grams after a resize — `2.0100000000000002 g` of TARA
 * GUM at 670 g — which made the synthetic template stabilizer hold fractional
 * and cost the LP its integer certification, so `projectManualIngredientTarget`
 * discarded every candidate.
 *
 * These tests pin BOTH directions: Gelato is now projected, and Sorbet is
 * untouched.
 */
import { describe, expect, it } from 'vitest';
import { findDemoIngredient } from '@/data/demoIngredients';
import type { ProductCategory, RecipeInput, RecipeItem } from '@/engine';
import { planOwnerStabilizerSystemRescale } from './ownerStabilizerRescaleProjection';
import { planSorbetStabilizerSystemRescale } from './sorbetStabilizerRescaleProjection';
import {
  ownerStabilizerSystemApplies,
  ownerStabilizerSystemItems,
  ownerStabilizerWholeGramBand,
} from './ownerStabilizerSystemAuthority';

const isWhole = (v: number) => Math.abs(v - Math.round(v)) <= 1e-9;

const item = (id: string, grams: number, role: 'stabilizer' | 'other'): RecipeItem =>
  ({
    id, planned_grams: grams, lock_type: 'unlocked', actual_grams: null,
    ingredient: {
      ...findDemoIngredient(role === 'stabilizer' ? 'tara_gum' : 'milk_3_5')!,
      id, canonical_ingredient_id: id,
    },
  }) as unknown as RecipeItem;

const recipe = (category: ProductCategory, batch: number, stabilizerGrams: number): RecipeInput =>
  ({
    category, target_batch_grams: batch,
    items: [item('stab', stabilizerGrams, 'stabilizer'), item('milk', batch - stabilizerGrams, 'other')],
  }) as unknown as RecipeInput;

/** Every product type the owner authority governs. */
const GOVERNED: ProductCategory[] = (
  ['milk_gelato', 'fruit_gelato', 'nut_gelato', 'chocolate_gelato', 'alcohol_gelato', 'sorbet'] as const
).filter((c) => ownerStabilizerSystemApplies(c));

/** Product types with no published whole-gram band — must stay untouched. */
const UNGOVERNED: ProductCategory[] = (['vegan_gelato', 'protein_gelato'] as const)
  .filter((c) => !ownerStabilizerSystemApplies(c));

describe('owner stabilizer whole-gram rescale projection', () => {
  it('governs every Gelato category, not only Sorbet', () => {
    expect(GOVERNED).toContain('milk_gelato');
    expect(GOVERNED).toContain('sorbet');
    expect(GOVERNED.length).toBe(6);
  });

  // ---- THE PROOF: zero fractional stabilizers after any rescale --------------
  it.each(GOVERNED)('%s — no rescale leaves a fractional stabilizer gram', (category) => {
    // The batch pairs that produce fractions proportionally, including the
    // Ninja CREAMi Deluxe 1000 → 670 case that produced 2.0100000000000002 g.
    const cases: Array<[number, number, number]> = [
      [1000, 670, 3], [1000, 670, 5], [1000, 500, 3], [500, 1400, 2],
      [670, 1000, 2], [1000, 333, 4], [900, 670, 4], [1000, 670, 2],
    ];
    for (const [fromBatch, toBatch, stabilizerGrams] of cases) {
      const source = recipe(category, fromBatch, stabilizerGrams);
      const factor = toBatch / fromBatch;
      const scaled = recipe(category, toBatch, stabilizerGrams * factor);
      const plan = planOwnerStabilizerSystemRescale(source, scaled);
      expect(plan, `${category} ${fromBatch}→${toBatch}`).not.toBeNull();
      for (const grams of plan!.values()) {
        expect(isWhole(grams), `${category} ${fromBatch}→${toBatch} produced ${grams}`).toBe(true);
        expect(grams).toBeGreaterThanOrEqual(0);
      }
      const total = [...plan!.values()].reduce((s, v) => s + v, 0);
      const band = ownerStabilizerWholeGramBand(category, toBatch);
      expect(total, `${category} ${fromBatch}→${toBatch} total`).toBeLessThanOrEqual(band.maxGrams);
    }
  });

  it('the 1000 g → 670 g Gelato case that produced 2.0100000000000002 g now lands whole', () => {
    const source = recipe('milk_gelato', 1000, 3);
    const scaled = recipe('milk_gelato', 670, 3 * 0.67); // 2.0100000000000002
    expect(isWhole(scaled.items[0]!.planned_grams)).toBe(false); // the input really is fractional
    const plan = planOwnerStabilizerSystemRescale(source, scaled);
    expect(plan!.get('stab')).toBe(2);
  });

  // ---- Sorbet is the control: byte-identical behaviour ----------------------
  it('Sorbet is unchanged — the Sorbet entry point and the owner projection agree', () => {
    for (const [from, to, grams] of [[1000, 670, 5], [1000, 500, 4], [670, 1400, 3]] as const) {
      const source = recipe('sorbet', from, grams);
      const scaled = recipe('sorbet', to, (grams * to) / from);
      const viaSorbet = planSorbetStabilizerSystemRescale(source, scaled);
      const viaOwner = planOwnerStabilizerSystemRescale(source, scaled);
      expect([...viaSorbet!.entries()]).toEqual([...viaOwner!.entries()]);
    }
  });

  it('the Sorbet entry point still refuses non-Sorbet, so its contract is unchanged', () => {
    const source = recipe('milk_gelato', 1000, 3);
    const scaled = recipe('milk_gelato', 670, 2.0100000000000002);
    expect(planSorbetStabilizerSystemRescale(source, scaled)).toBeNull();
    expect(planOwnerStabilizerSystemRescale(source, scaled)).not.toBeNull();
  });

  // ---- no invented authority -------------------------------------------------
  it.each(UNGOVERNED)('%s has no published band, so the projection stays out', (category) => {
    const source = recipe(category, 1000, 2);
    const scaled = recipe(category, 670, 1.34);
    expect(planOwnerStabilizerSystemRescale(source, scaled)).toBeNull();
  });

  it('a governed recipe with no stabilizer line is left alone', () => {
    const source = { category: 'milk_gelato', target_batch_grams: 1000,
      items: [item('milk', 1000, 'other')] } as unknown as RecipeInput;
    expect(planOwnerStabilizerSystemRescale(source, source)).toBeNull();
    expect(ownerStabilizerSystemItems(source.items)).toHaveLength(0);
  });

  it('scaling UP is never clamped away by the old ceiling', () => {
    const source = recipe('milk_gelato', 500, 2);
    const scaled = recipe('milk_gelato', 1400, 5.6);
    const plan = planOwnerStabilizerSystemRescale(source, scaled);
    expect(plan!.get('stab')).toBeGreaterThanOrEqual(5);
  });
});
