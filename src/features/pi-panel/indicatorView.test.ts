import { describe, expect, it } from 'vitest';
import { STATUS_LABELS } from '@/components/shared/status';
import { findDemoIngredient } from '@/data/demoIngredients';
import { calculateRecipe, type LockType, type RecipeInput, type RecipeItem } from '@/engine';
import { buildFallbackNotes, buildIndicatorRows, buildWarnings } from './indicatorView';

const line = (id: string, planned: number, lock: LockType = 'unlocked'): RecipeItem => ({
  id: `l-${id}`,
  ingredient: findDemoIngredient(id)!,
  planned_grams: planned,
  actual_grams: null,
  lock_type: lock,
});

const milkBase: RecipeInput = {
  items: [line('milk_3_5', 670), line('cream_30', 130), line('smp', 35), line('sucrose', 130), line('dextrose', 30), line('tara_gum', 5)],
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
};

describe('buildIndicatorRows', () => {
  const rows = buildIndicatorRows(calculateRecipe(milkBase));

  it('produces the 11 PI indicators', () => {
    expect(rows).toHaveLength(11);
  });

  it('maps every status to a valid chip status with sane bar bounds', () => {
    for (const row of rows) {
      expect(Object.keys(STATUS_LABELS)).toContain(row.status);
      expect(row.displayMin).toBeLessThanOrEqual(row.displayMax);
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it('assigns every indicator to a valid scan group', () => {
    for (const row of rows) {
      expect(['freezing', 'balance', 'risk']).toContain(row.group);
    }
    // every group is represented (grouped PI panel has no empty section)
    expect(new Set(rows.map((row) => row.group))).toEqual(
      new Set(['freezing', 'balance', 'risk']),
    );
  });
});

describe('calibration honesty', () => {
  it('surfaces the category fallback note for an unseeded category', () => {
    const fruit = calculateRecipe({ ...milkBase, category: 'fruit_gelato' });
    expect(buildFallbackNotes(fruit).length).toBeGreaterThan(0);
    // milk gelato @ -11 is the seeded band — no fallback note
    expect(buildFallbackNotes(calculateRecipe(milkBase))).toEqual([]);
  });

  it('surfaces engine warnings (alcohol above the safe range)', () => {
    const boozy = calculateRecipe({
      ...milkBase,
      category: 'alcohol_gelato',
      items: [...milkBase.items, line('whiskey_40', 80)],
    });
    expect(buildWarnings(boozy).map((warning) => warning.code)).toContain('alcohol_above_safe_range');
    for (const warning of buildWarnings(boozy)) expect(warning.message.length).toBeGreaterThan(0);
  });
});
