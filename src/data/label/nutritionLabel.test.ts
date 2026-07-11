import { describe, expect, it } from 'vitest';
import type { NutritionPer100g } from '@/engine';
import {
  buildNutritionDeclaration,
  KJ_PER_KCAL,
  type NutritionDeclaration,
  type NutritionRow,
  type NutritionRowKey,
} from './nutritionLabel';

const base: NutritionPer100g = {
  kcal: 128.6,
  fat_g: 7.06,
  saturated_fat_g: null,
  carbohydrate_g: 22.1,
  sugars_g: 20.4,
  protein_g: 3.83,
  salt_g: 0.128,
  fiber_g: 0.6,
  alcohol_g: 0,
};

function get(decl: NutritionDeclaration, key: NutritionRowKey): NutritionRow {
  const row = decl.rows.find((r) => r.key === key);
  if (!row) throw new Error(`missing nutrition row: ${key}`);
  return row;
}

function decl(input: NutritionPer100g): NutritionDeclaration {
  const result = buildNutritionDeclaration(input);
  if (!result) throw new Error('expected a declaration');
  return result;
}

describe('buildNutritionDeclaration', () => {
  it('returns null for null input (zero-mass batch — never a fabricated label)', () => {
    expect(buildNutritionDeclaration(null)).toBeNull();
  });

  it('emits the EU declaration order (alcohol omitted when absent)', () => {
    const d = decl(base);
    expect(d.rows.map((r) => r.key)).toEqual([
      'energy',
      'fat',
      'saturated',
      'carbohydrate',
      'sugars',
      'protein',
      'salt',
      'fibre',
    ]);
  });

  it('declares energy in both kJ and kcal, with kJ = round(kcal * 4.184)', () => {
    expect(KJ_PER_KCAL).toBeCloseTo(4.184, 3);
    const energy = get(decl(base), 'energy');
    const kcal = Math.round(base.kcal); // 129
    const kj = Math.round(base.kcal * KJ_PER_KCAL); // 538
    expect(energy.value).toBe(kcal);
    expect(energy.valueDisplay).toBe(`${kj} kJ / ${kcal} kcal`);
  });

  it('declares saturated as "not available" (never a fake 0) when the engine reports null', () => {
    const d = decl(base);
    const saturated = get(d, 'saturated');
    expect(saturated.value).toBeNull();
    expect(saturated.valueDisplay).toBeNull();
    expect(d.saturatedDeclared).toBe(false);
    expect(saturated.indented).toBe(true);
  });

  it('declares saturated with a 1-decimal value when the engine provides it', () => {
    const d = decl({ ...base, saturated_fat_g: 4.36 });
    const saturated = get(d, 'saturated');
    expect(d.saturatedDeclared).toBe(true);
    expect(saturated.value).toBeCloseTo(4.4, 5);
    expect(saturated.valueDisplay).toBe('4.4 g');
  });

  it('applies the regulatory precisions (salt 2 decimals; others 1)', () => {
    const d = decl(base);
    expect(get(d, 'fat').valueDisplay).toBe('7.1 g');
    expect(get(d, 'carbohydrate').valueDisplay).toBe('22.1 g');
    expect(get(d, 'sugars').valueDisplay).toBe('20.4 g');
    expect(get(d, 'protein').valueDisplay).toBe('3.8 g');
    expect(get(d, 'fibre').valueDisplay).toBe('0.6 g');
    expect(get(d, 'salt').valueDisplay).toBe('0.13 g'); // 2 decimals
    expect(get(d, 'salt').value).toBeCloseTo(0.13, 5);
  });

  it('adds the alcohol row only when alcohol is present', () => {
    const d = decl({ ...base, alcohol_g: 3.2 });
    expect(d.alcoholDeclared).toBe(true);
    const alcohol = get(d, 'alcohol');
    expect(alcohol.value).toBeCloseTo(3.2, 5);
    expect(d.rows[d.rows.length - 1]?.key).toBe('alcohol');
  });
});
