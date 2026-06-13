import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { findDemoIngredient } from './demoIngredients';
import { DEFAULT_PRESET, DEFAULT_PRESET_ID, DEMO_PRESETS, findPreset } from './demoPresets';

const REQUIRED_IDS = [
  'milk-base',
  'raspberry-premium',
  'actual-batch-rescue',
  'jim-beam',
  'pistachio-high-fat',
];

const expectAllNumbersFinite = (value: unknown, path = '$'): void => {
  if (typeof value === 'number') {
    expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => expectAllNumbersFinite(entry, `${path}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) expectAllNumbersFinite(entry, `${path}.${key}`);
  }
};

describe('demo presets', () => {
  it('contains exactly the five required presets', () => {
    expect(DEMO_PRESETS.map((preset) => preset.id).sort()).toEqual([...REQUIRED_IDS].sort());
  });

  it('default preset is Milk Base and resolves', () => {
    expect(DEFAULT_PRESET_ID).toBe('milk-base');
    expect(DEFAULT_PRESET.id).toBe('milk-base');
    expect(findPreset('milk-base')).toBe(DEFAULT_PRESET);
  });

  it('every preset line resolves to a demo ingredient with a stable, unique id', () => {
    for (const preset of DEMO_PRESETS) {
      const ids = new Set<string>();
      for (const item of preset.items) {
        expect(findDemoIngredient(item.ingredient.id), `${preset.id} ${item.ingredient.id}`).toBeDefined();
        expect(item.id.startsWith(`${preset.id}:`), item.id).toBe(true);
        expect(ids.has(item.id), `duplicate line id ${item.id}`).toBe(false);
        ids.add(item.id);
      }
    }
  });

  it('Actual Batch Rescue records actual grams (and an over-pour)', () => {
    const rescue = findPreset('actual-batch-rescue')!;
    expect(rescue.items.some((item) => item.actual_grams !== null)).toBe(true);
    const sucrose = rescue.items.find((item) => item.ingredient.id === 'sucrose')!;
    expect(sucrose.actual_grams).toBeGreaterThan(sucrose.planned_grams); // the over-pour
  });

  it('Raspberry Premium and Pistachio High Fat each lock a main ingredient', () => {
    for (const id of ['raspberry-premium', 'pistachio-high-fat'] as const) {
      const mains = findPreset(id)!.items.filter((item) => item.lock_type === 'main');
      expect(mains, id).toHaveLength(1);
    }
  });

  it('every preset runs through calculateRecipe safely (finite, never throws)', () => {
    for (const preset of DEMO_PRESETS) {
      const result = calculateRecipe(buildRecipeInput(preset));
      expect(result.total_batch_g).toBeGreaterThan(0);
      expectAllNumbersFinite(result);
    }
  });
});
