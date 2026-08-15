import { beforeEach, describe, expect, it } from 'vitest';
import { starterMilkBase } from '@/features/recipe-constraints/constraintFixtures';
import {
  attachRecipeProfileMetadata,
  readRecipeProfileMetadata,
} from '@/features/pro-workbench/recipeProfilePersistence';
import type { ProfileSettingsSnapshot } from '@/features/pro-workbench/recipeProfileStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { ingredientRowMeta, useIngredientTableUxStore } from './ingredientTableUxStore';

const settings: ProfileSettingsSnapshot = {
  visibleProductType: 'gelato',
  mode: 'classic',
  formulationStrategy: 'optimal',
  targetBatchGrams: 1_000,
  machineKind: 'professional',
  machineId: null,
  machineLabel: 'Maszyna profesjonalna',
  servingModeId: 'temp_minus_12',
  targetTemperatureC: -12,
  machineCapacityGrams: null,
  directionTargets: { sweetness: 0, softness: 0, creaminess: 0, flavor: 0 },
};

beforeEach(() => {
  useRecipeStore.getState().resetToDemo();
  useIngredientTableUxStore.getState().reset();
});

describe('saved product-dose ownership', () => {
  it('round-trips USER_SET through the optional recipe-profile metadata field', () => {
    const input = starterMilkBase();
    const lineId = input.items[0]!.id;
    const dose = {
      provenance: 'USER_SET' as const,
      groupId: 'fresh-fruit:3:FRUIT_EQUIVALENT',
      suggestedPercent: 30,
      suggestedTotalGrams: 300,
    };
    const saved = attachRecipeProfileMetadata(input, settings, {
      [lineId]: { role: 'standard', required: false, dose },
    });

    const restored = readRecipeProfileMetadata(saved);
    expect(restored?.ingredientUxByLineId?.[lineId]?.dose).toEqual(dose);

    useRecipeStore.getState().loadRecipeInput(saved);
    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, lineId).dose)
      .toEqual(dose);
  });

  it('keeps legacy metadata valid and defaults absent dose ownership to NONE', () => {
    const saved = attachRecipeProfileMetadata(starterMilkBase(), settings, {
      legacy: { role: 'addition', required: true },
    });
    const restored = readRecipeProfileMetadata(saved);
    useIngredientTableUxStore
      .getState()
      .hydrateRecipeMeta(restored?.ingredientUxByLineId ?? {});

    expect(ingredientRowMeta(useIngredientTableUxStore.getState().metaByLineId, 'legacy').dose)
      .toMatchObject({ provenance: 'NONE', groupId: null });
  });

  it('drops malformed dose evidence without dropping accepted role/required metadata', () => {
    const saved = attachRecipeProfileMetadata(starterMilkBase(), settings, {
      fruit: { role: 'standard', required: true },
    }) as unknown as Record<string, unknown>;
    const profile = saved.pinguino_profile_v1 as Record<string, unknown>;
    profile.ingredientUxByLineId = {
      fruit: {
        role: 'standard',
        required: true,
        dose: {
          provenance: 'AUTO_SUGGESTED',
          groupId: 'fruit',
          suggestedPercent: '30',
          suggestedTotalGrams: -1,
        },
      },
    };

    expect(readRecipeProfileMetadata(saved as never)?.ingredientUxByLineId?.fruit).toEqual({
      role: 'standard',
      required: true,
    });
  });

  it.each([
    {
      provenance: 'AUTO_SUGGESTED',
      groupId: null,
      suggestedPercent: null,
      suggestedTotalGrams: null,
    },
    {
      provenance: 'UNKNOWN',
      groupId: 'invented-group',
      suggestedPercent: 30,
      suggestedTotalGrams: 300,
    },
    {
      provenance: 'USER_SET',
      groupId: '',
      suggestedPercent: 30,
      suggestedTotalGrams: 300,
    },
  ])('rejects inconsistent persisted provenance without rejecting the recipe', (dose) => {
    const saved = attachRecipeProfileMetadata(starterMilkBase(), settings, {
      fruit: { role: 'standard', required: false },
    }) as unknown as Record<string, unknown>;
    const profile = saved.pinguino_profile_v1 as Record<string, unknown>;
    profile.ingredientUxByLineId = {
      fruit: { role: 'standard', required: false, dose },
    };

    expect(readRecipeProfileMetadata(saved as never)?.ingredientUxByLineId?.fruit).toEqual({
      role: 'standard',
      required: false,
    });
  });
});
