import { describe, expect, it } from 'vitest';
import { calculateRecipe, CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { ownerSameInputRecipe } from '@/features/formulation/__fixtures__/ownerSameInputFixture';
import {
  attachPracticalRecipeAudit,
  practicalRecipeAuditMatchesInput,
  practicalizeRecipeCandidate,
  readPracticalRecipeAudit,
} from '@/features/practical-recipe/practicalRecipe';
import {
  buildSavePayload,
  deriveProductType,
  deriveServingProfile,
  resolveSaveMode,
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
    // Owner decision (Slice C, AUDIT #19 / SPEC §11.2): 'storage-minus-18' left the
    // serving vocabulary, so an intake can no longer produce it — a serving preview
    // id passes through unchanged instead. Legacy saved rows still display via the
    // storage label set (see MyRecipesPage).
    expect(deriveServingProfile('display-minus-12')).toBe('display-minus-12');
    expect(deriveServingProfile(null)).toBe('display-minus-11');
  });
});

describe('resolveSaveMode (new vs overwrite vs save-as-new)', () => {
  it('creates a new recipe when there is no in-session saved id', () => {
    expect(resolveSaveMode(null, false)).toBe('create');
  });

  it('overwrites the loaded/just-saved recipe', () => {
    expect(resolveSaveMode('rec-1', false)).toBe('update');
  });

  it('"Save as new" always creates a separate record, even for a loaded recipe', () => {
    expect(resolveSaveMode('rec-1', true)).toBe('create');
    expect(resolveSaveMode(null, true)).toBe('create');
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

  it('round-trips the Protein product and exact user target without falling back to Gelato', () => {
    const base = sampleInput();
    const input = {
      ...base,
      category: 'protein_gelato' as const,
      goals: {
        ...base.goals,
        target_protein_percent: 22.4,
      },
    };
    const payload = buildSavePayload({
      name: 'Protein strawberry',
      recipeInput: input,
      intakeProductId: null,
      intakeServingId: null,
    });
    expect(payload.product_type).toBe('protein');
    const loaded = savedToRecipeInput(JSON.parse(JSON.stringify(payload.recipe_input)));
    expect(loaded.category).toBe('protein_gelato');
    expect(loaded.goals?.target_protein_percent).toBe(22.4);
    expect(loaded.items).toEqual(input.items);
  });
  it('round-trips exact Recipe Direction targets without persisting any Apply consent', () => {
    const base = sampleInput();
    const input = {
      ...base,
      goals: {
        ...base.goals,
        direction_targets: {
          sweetness: -1 as const,
          softness: 1 as const,
          creaminess: 0 as const,
          flavor: 0 as const,
        },
        direction_targets_active: true,
      },
    };
    const payload = buildSavePayload({
      name: 'Directional gelato',
      recipeInput: input,
      intakeProductId: null,
      intakeServingId: null,
    });
    const serialized = JSON.stringify(payload.recipe_input);
    expect(serialized).not.toContain('substitutionConsent');
    const loaded = savedToRecipeInput(JSON.parse(serialized));
    expect(loaded.goals?.direction_targets).toEqual(input.goals.direction_targets);
    expect(loaded.goals?.direction_targets_active).toBe(true);
  });
  it('round-trips persisted range and unavailable sidecars through a saved version', () => {
    const base = sampleInput();
    const [first] = base.items;
    const input = {
      ...base,
      items: base.items.map((item) =>
        item.id === first!.id
          ? {
              ...item,
              lock_type: 'grams' as const,
              range_constraint: { min_grams: 90, max_grams: 140 },
            }
          : item,
      ),
      goals: {
        ...base.goals,
        excluded_ingredient_ids: ['PI-ING-000494'],
        unavailable_main_ingredient_ids: ['PI-ING-001553'],
      },
    };
    const payload = buildSavePayload({
      name: 'Range and availability',
      recipeInput: input,
      intakeProductId: null,
      intakeServingId: null,
    });
    const loaded = savedToRecipeInput(JSON.parse(JSON.stringify(payload.recipe_input)));
    expect(loaded.items[0]?.range_constraint).toEqual({ min_grams: 90, max_grams: 140 });
    expect(loaded.goals?.excluded_ingredient_ids).toEqual(['PI-ING-000494']);
    expect(loaded.goals?.unavailable_main_ingredient_ids).toEqual(['PI-ING-001553']);
  });
  it('round-trips a durable exact-grams sidecar without weakening Required', () => {
    const base = sampleInput();
    const [first] = base.items;
    const input = {
      ...base,
      items: base.items.map((item) =>
        item.id === first!.id
          ? {
              ...item,
              lock_type: 'required' as const,
              grams_constraint: { grams: item.planned_grams },
            }
          : item,
      ),
    };
    const payload = buildSavePayload({
      name: 'Required exact grams',
      recipeInput: input,
      intakeProductId: null,
      intakeServingId: null,
    });
    const loaded = savedToRecipeInput(JSON.parse(JSON.stringify(payload.recipe_input)));
    expect(loaded.items[0]).toMatchObject({
      lock_type: 'required',
      grams_constraint: { grams: first!.planned_grams },
    });
  });
  it('round-trips the exact→executable practical audit with the saved canonical input', () => {
    const practical = practicalizeRecipeCandidate(ownerSameInputRecipe(), { byLineId: {} });
    expect(practical.ok).toBe(true);
    if (!practical.ok) return;
    const savedInput = attachPracticalRecipeAudit(
      practical.audit.executableInput,
      practical.audit.exactInput,
      '2026-08-11T12:00:00.000Z',
    );
    const payload = buildSavePayload({
      name: 'Owner practical G17',
      recipeInput: savedInput,
      intakeProductId: null,
      intakeServingId: null,
    });
    const loaded = savedToRecipeInput(JSON.parse(JSON.stringify(payload.recipe_input)));
    const audit = readPracticalRecipeAudit(loaded);
    const taraLine = loaded.items.find((line) => line.id === 'owner:tara_gum');
    expect(audit?.modelVersion).toBe(practical.audit.modelVersion);
    expect(taraLine).toBeDefined();
    expect(audit?.exactGramsByLineId[taraLine!.id]).toBe(1.9);
    expect(taraLine?.planned_grams).toBe(2);
    expect(practicalRecipeAuditMatchesInput(loaded, audit)).toBe(true);
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
