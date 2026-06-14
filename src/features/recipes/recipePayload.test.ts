import { describe, expect, it } from 'vitest';
import { calculateRecipe, CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  buildSavePayload,
  deriveProductType,
  deriveServingProfile,
  savedToRecipeInput,
} from './recipePayload';

const sampleInput = () =>
  buildRecipeInput({
    mode: DEFAULT_PRESET.mode,
    category: DEFAULT_PRESET.category, // milk-base preset → milk_gelato
    target_temperature_c: DEFAULT_PRESET.target_temperature_c,
    target_batch_grams: DEFAULT_PRESET.target_batch_grams,
    machine_capacity_grams: DEFAULT_PRESET.machine_capacity_grams,
    flavor_intensity: DEFAULT_PRESET.flavor_intensity,
    cost_priority: DEFAULT_PRESET.cost_priority,
    items: DEFAULT_PRESET.items,
  });

describe('buildSavePayload', () => {
  it('stores recipe_input as the source of truth and stamps engine provenance', () => {
    const input = sampleInput();
    const payload = buildSavePayload({
      name: '  House Base ',
      recipeInput: input,
      intakeProductId: null,
      intakeServingId: null,
    });
    expect(payload.recipe_input).toBe(input);
    expect(payload.active_engine_label).toBe('−11°C Engine');
    expect(payload.engine_version).toBe(ENGINE_VERSION);
    expect(payload.config_version).toBe(CONFIG_VERSION);
    expect(payload.batch_grams).toBe(input.target_batch_grams);
    expect(payload.name).toBe('House Base'); // trimmed
    // never stores calculated values
    const keys = Object.keys(payload);
    for (const calc of ['pod', 'npac', 'ice_fraction', 'scores', 'indicators']) {
      expect(keys).not.toContain(calc);
    }
  });

  it('derives product_type from category and serving from the connected default', () => {
    const payload = buildSavePayload({
      name: 'x',
      recipeInput: sampleInput(),
      intakeProductId: null,
      intakeServingId: null,
    });
    expect(payload.product_type).toBe('gelato'); // milk_gelato → gelato
    expect(payload.serving_profile).toBe('display-minus-11'); // default connected profile
  });

  it('prefers explicit intake selections; null only when genuinely underivable', () => {
    expect(deriveProductType('sorbet', 'milk_gelato')).toBe('sorbet');
    expect(deriveProductType(null, 'sorbet')).toBe('sorbet');
    expect(deriveProductType(null, 'chocolate_gelato')).toBeNull();
    expect(deriveServingProfile('storage-minus-18')).toBe('storage-minus-18');
    expect(deriveServingProfile(null)).toBe('display-minus-11');
  });
});

describe('savedToRecipeInput (load validation)', () => {
  it('round-trips a saved recipe_input and calculateRecipe runs from it', () => {
    const payload = buildSavePayload({
      name: 'x',
      recipeInput: sampleInput(),
      intakeProductId: null,
      intakeServingId: null,
    });
    const stored = JSON.parse(JSON.stringify(payload.recipe_input)); // simulate jsonb round-trip
    const loaded = savedToRecipeInput(stored);
    const result = calculateRecipe(loaded);
    expect(result.items.length).toBeGreaterThan(0);
    expect(Number.isFinite(result.total_batch_g)).toBe(true);
    expect(result.npac_points).not.toBeNull();
  });

  it('tolerates unknown/future fields (old saves keep loading)', () => {
    const stored = JSON.parse(JSON.stringify(sampleInput())) as {
      items: Array<{ ingredient: Record<string, unknown> }>;
    } & Record<string, unknown>;
    stored.future_engine_field = 'whatever';
    stored.items[0]!.ingredient.future_prop = 123;
    expect(() => savedToRecipeInput(stored)).not.toThrow();
  });

  it('rejects a clearly invalid recipe_input', () => {
    expect(() => savedToRecipeInput({ items: 'nope' })).toThrow();
    expect(() => savedToRecipeInput(null)).toThrow();
  });
});
