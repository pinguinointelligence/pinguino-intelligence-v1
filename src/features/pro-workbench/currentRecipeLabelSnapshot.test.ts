import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import type { RecipeInput } from '@/engine';
import { productBehaviorTestSnapshots } from '@/features/product-intelligence/productBehaviorTestFixture';
import type { RecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  productionSourceFingerprint,
  type ProductionCompletionSnapshot,
  type ProductionSource,
} from '@/features/production-workspace/productionSession';
import {
  currentRecipeCompletionSnapshot,
  type CurrentRecipeLabelProduction,
} from './currentRecipeLabelSnapshot';

const input: RecipeInput = {
  items: DEFAULT_PRESET.items.map((item) => ({ ...item, actual_grams: null })),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
};

const composition: RecipeCompositionMetadata = {
  schemaVersion: 1,
  baseScope: 'BASE_FORMULATION',
  baseOrder: input.items.map((item) => item.id),
  toppings: [],
  behaviorSnapshots: productBehaviorTestSnapshots(input),
  migrationAmbiguities: [],
};

const source: ProductionSource = {
  recipeId: 'recipe-current',
  recipeVersionId: 'recipe-current-v3',
  recipeVersionNumber: 3,
  recipeName: 'Bieżąca pistacja',
};

const fingerprint = productionSourceFingerprint(input, composition);

function matchingProduction(): CurrentRecipeLabelProduction {
  const snapshot = {
    source: { ...source },
    plannedInput: input,
    productComposition: composition,
  } as ProductionCompletionSnapshot;

  return {
    source: { ...source },
    currentSourceFingerprint: fingerprint,
    session: {
      status: 'completed',
      source: { ...source },
      sourceFingerprint: fingerprint,
      completionSnapshot: snapshot,
    },
  };
}

describe('current recipe label snapshot authority', () => {
  it('accepts the completed snapshot only when recipe, version and content all match', () => {
    const production = matchingProduction();
    expect(currentRecipeCompletionSnapshot(production)).toBe(
      production.session?.completionSnapshot,
    );
  });

  it.each([
    ['recipe id', { recipeId: 'recipe-foreign' }],
    ['version id', { recipeVersionId: 'recipe-current-v2' }],
    ['version number', { recipeVersionNumber: 2 }],
  ])('rejects a completed session from another %s', (_name, changedSource) => {
    const production = matchingProduction();
    production.session = {
      ...production.session!,
      source: { ...production.session!.source, ...changedSource },
    };
    expect(currentRecipeCompletionSnapshot(production)).toBeNull();
  });

  it('rejects a snapshot whose own recipe identity differs from its session', () => {
    const production = matchingProduction();
    production.session = {
      ...production.session!,
      completionSnapshot: {
        ...production.session!.completionSnapshot!,
        source: {
          ...production.session!.completionSnapshot!.source,
          recipeId: 'recipe-foreign',
        },
      },
    };
    expect(currentRecipeCompletionSnapshot(production)).toBeNull();
  });

  it('rejects a completed session after the current recipe content changes', () => {
    const production = matchingProduction();
    production.currentSourceFingerprint = `${fingerprint}:changed`;
    expect(currentRecipeCompletionSnapshot(production)).toBeNull();
  });

  it('rejects a snapshot whose frozen input differs from the current recipe', () => {
    const production = matchingProduction();
    production.session = {
      ...production.session!,
      completionSnapshot: {
        ...production.session!.completionSnapshot!,
        plannedInput: { ...input, target_batch_grams: input.target_batch_grams + 100 },
      },
    };
    expect(currentRecipeCompletionSnapshot(production)).toBeNull();
  });

  it('returns no label snapshot before a completed run exists', () => {
    expect(currentRecipeCompletionSnapshot(undefined)).toBeNull();
    expect(currentRecipeCompletionSnapshot({ ...matchingProduction(), session: null })).toBeNull();
  });
});
