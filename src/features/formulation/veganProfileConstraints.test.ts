import { describe, expect, it } from 'vitest';
import { DEFAULT_CORRECTION_CANDIDATES, type EngineIngredient, type RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import {
  VEGAN_INULIN_CALIBRATION_MAX_PERCENT,
  veganProfileConstraintIssues,
} from './veganProfileConstraints';

const WATER = DEFAULT_CORRECTION_CANDIDATES.find((candidate) => candidate.id === 'water')!.ingredient;
const TARA = findDemoIngredient('tara_gum')!;
const INULIN = findDemoIngredient('inulin')!;
const line = (id: string, ingredient: EngineIngredient, grams: number) => ({
  id, ingredient, planned_grams: grams, actual_grams: null, lock_type: 'unlocked' as const,
});
const input = (items: ReturnType<typeof line>[]): RecipeInput => ({
  mode: 'classic', category: 'vegan_gelato', target_temperature_c: -13,
  target_batch_grams: 1000, machine_capacity_grams: null, items,
});

describe('Vegan formulation envelope', () => {
  it('accepts exact Tara minimum with floating-point tolerance', () => {
    expect(veganProfileConstraintIssues(input([line('water', WATER, 998), line('tara', TARA, 2)]))).toEqual([]);
  });

  it.each([
    ['missing', [line('water', WATER, 1000)], 'stabilizer_missing'],
    ['below', [line('water', WATER, 998.01), line('tara', TARA, 1.99)], 'stabilizer_below_approved_window'],
    ['above', [line('water', WATER, 989.99), line('tara', TARA, 10.01)], 'stabilizer_above_approved_window'],
  ] as const)('blocks stabilizer state: %s', (_label, items, code) => {
    expect(veganProfileConstraintIssues(input([...items])).map((issue) => issue.code)).toContain(code);
  });

  it('blocks an unregistered stabilizer rather than borrowing Tara dosage', () => {
    const unknown: EngineIngredient = {
      ...TARA,
      id: 'manual-stabilizer-blend',
      canonical_ingredient_id: 'manual-stabilizer-blend',
      name: 'Manual stabilizer blend',
    };
    expect(
      veganProfileConstraintIssues(input([line('water', WATER, 998), line('unknown', unknown, 2)]))
        .map((issue) => issue.code),
    ).toContain('stabilizer_window_unknown');
  });

  it('pins the owner high-inulin ceiling and blocks any excess', () => {
    const ceiling = VEGAN_INULIN_CALIBRATION_MAX_PERCENT * 10;
    expect(
      veganProfileConstraintIssues(
        input([line('water', WATER, 1000 - ceiling - 2), line('inulin', INULIN, ceiling), line('tara', TARA, 2)]),
      ),
    ).toEqual([]);
    expect(
      veganProfileConstraintIssues(
        input([line('water', WATER, 1000 - ceiling - 2.01), line('inulin', INULIN, ceiling + 0.01), line('tara', TARA, 2)]),
      ).map((issue) => issue.code),
    ).toContain('inulin_above_calibration_envelope');
  });

  it('applies the same ceiling to the second verified pure-inulin Mapper identity', () => {
    const inulinBio: EngineIngredient = {
      ...INULIN,
      id: 'PI-ING-000455',
      canonical_ingredient_id: 'PI-ING-000455',
      name: 'INULIN · Specialty · BIO',
    };
    const overCeiling = VEGAN_INULIN_CALIBRATION_MAX_PERCENT * 10 + 0.01;
    expect(
      veganProfileConstraintIssues(
        input([
          line('water', WATER, 1000 - overCeiling - 2),
          line('inulin-bio', inulinBio, overCeiling),
          line('tara', TARA, 2),
        ]),
      ).map((issue) => issue.code),
    ).toContain('inulin_above_calibration_envelope');
  });
});
