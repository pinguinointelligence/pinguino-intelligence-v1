import { describe, expect, it } from 'vitest';
import {
  FORBIDDEN_DEMO_KEYS,
  assertDemoSafe,
  findDemoLeaks,
  isDemoSafe,
  toDemoSafeRecipe,
} from './demoSafeRecipe';

/** A realistic saved recipe_input, complete with everything a Demo must not see. */
const FULL_RECIPE_INPUT = {
  mode: 'PRO',
  category: 'GELATO_WHITE',
  target_temperature_c: -13,
  target_batch_grams: 1000,
  goals: { sweetness: 'HIGH', hardness: 0 },
  items: [
    {
      id: 'line-1',
      planned_grams: 512,
      actual_grams: 512,
      lock_type: 'MAIN',
      main_ratio_weight: 1,
      grams_constraint: { grams: 512 },
      ingredient: {
        id: 'PI-ING-000123',
        canonical_ingredient_id: 'PI-ING-000123',
        name: 'MLEKO 3,2%',
        category: 'DAIRY_LIQUID',
        composition: { water_g: 88, fat_g: 3.2, protein_g: 3.3 },
        pod_value: 0,
        pac_value: 0,
        de_value: null,
        cost_per_kg: 3.4,
        confidence_score: 92,
      },
    },
    {
      id: 'line-2',
      planned_grams: 148,
      actual_grams: null,
      lock_type: 'NONE',
      ingredient: {
        id: 'PI-ING-000045',
        name: 'SACHAROZA',
        category: 'SUGAR',
        composition: { sucrose_g: 100 },
        pod_value: 100,
        pac_value: 100,
        de_value: null,
        cost_per_kg: 1.1,
        confidence_score: 100,
      },
    },
  ],
};

describe('demo-safe projection (§16 — the server must not SEND what it must not show)', () => {
  it('emits names and structure, and no gram anywhere', () => {
    const safe = toDemoSafeRecipe(FULL_RECIPE_INPUT);
    expect(safe.demo_safe).toBe(true);
    expect(safe.category).toBe('GELATO_WHITE');
    expect(safe.target_temperature_c).toBe(-13);
    expect(safe.line_count).toBe(2);
    expect(safe.items.map((item) => item.name)).toEqual(['MLEKO 3,2%', 'SACHAROZA']);
    expect(safe.items[0]?.is_main).toBe(true);
    expect(safe.items[1]?.is_main).toBeUndefined();
    expect(isDemoSafe(safe)).toBe(true);
  });

  it('drops EVERY forbidden key — not one survives the projection', () => {
    const serialized = JSON.stringify(toDemoSafeRecipe(FULL_RECIPE_INPUT));
    for (const key of FORBIDDEN_DEMO_KEYS) {
      expect(serialized.includes(`"${key}"`), key).toBe(false);
    }
    // and the actual values are gone too, not merely renamed
    expect(serialized).not.toContain('512');
    expect(serialized).not.toContain('148');
    expect(serialized).not.toContain('3.4');
  });

  it('is a WHITELIST: an unknown future Engine field is absent by construction', () => {
    const firstLine = FULL_RECIPE_INPUT.items[0]!;
    const withFutureField = {
      ...FULL_RECIPE_INPUT,
      secret_new_engine_field: 'PROPRIETARY',
      items: [
        {
          ...firstLine,
          another_new_field: 999,
          ingredient: { ...firstLine.ingredient, future_secret: 'x' },
        },
      ],
    };
    const serialized = JSON.stringify(toDemoSafeRecipe(withFutureField));
    expect(serialized).not.toContain('PROPRIETARY');
    expect(serialized).not.toContain('another_new_field');
    expect(serialized).not.toContain('future_secret');
    expect(serialized).not.toContain('999');
  });

  it('findDemoLeaks locates a leak at any depth, with its path', () => {
    const leaky = { ok: true, payload: { nested: [{ planned_grams: 512 }] } };
    const leaks = findDemoLeaks(leaky);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toEqual({ path: '$.payload.nested[0].planned_grams', key: 'planned_grams' });
    expect(isDemoSafe(leaky)).toBe(false);
  });

  it('catches the full recipe_input itself as unsafe (the regression that matters)', () => {
    expect(isDemoSafe(FULL_RECIPE_INPUT)).toBe(false);
    expect(() => assertDemoSafe(FULL_RECIPE_INPUT, 'share_preview')).toThrow(
      /demo-safe violation in share_preview/,
    );
  });

  it('assertDemoSafe passes a projected payload and survives cyclic input', () => {
    expect(() => assertDemoSafe(toDemoSafeRecipe(FULL_RECIPE_INPUT), 'share_preview')).not.toThrow();
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => findDemoLeaks(cyclic)).not.toThrow();
  });

  it('degrades safely on junk input rather than throwing at a share boundary', () => {
    expect(toDemoSafeRecipe(null).items).toEqual([]);
    expect(toDemoSafeRecipe({ items: 'not-an-array' }).line_count).toBe(0);
    expect(toDemoSafeRecipe({ items: [{}] }).items[0]?.name).toBe('Składnik');
  });
});
