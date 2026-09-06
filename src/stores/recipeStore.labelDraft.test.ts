import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import {
  attachRecipeLabelDraft,
  createRecipeLabelDraft,
} from '@/features/master-label/labelDraftPersistence';
import { recipePersistPartialize, useRecipeStore } from './recipeStore';

const input = (): RecipeInput => ({
  items: structuredClone(DEFAULT_PRESET.items),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

describe('recipe store label draft lifecycle', () => {
  beforeEach(() => useRecipeStore.getState().resetToDemo());

  it('keeps LOT/date through recalculation edits and persisted reload state', () => {
    const draft = {
      ...createRecipeLabelDraft({
        draftId: 'stable-current-label',
        now: new Date('2026-09-06T09:00:00.000Z'),
        timeZone: 'Europe/Madrid',
      }),
      productionDate: '2026-09-04',
    };
    useRecipeStore.getState().setLabelDraft(draft);
    const line = useRecipeStore.getState().items[0]!;
    useRecipeStore.getState().setPlannedGrams(line.id, line.planned_grams + 1);

    expect(useRecipeStore.getState().labelDraft).toEqual(draft);
    expect(recipePersistPartialize(useRecipeStore.getState()).labelDraft).toEqual(draft);
  });

  it('restores its own saved draft and clears it for a foreign recipe', () => {
    const draft = createRecipeLabelDraft({
      draftId: 'saved-label-v1',
      now: new Date('2026-09-06T09:00:00.000Z'),
      timeZone: 'Europe/Madrid',
    });
    useRecipeStore.getState().loadRecipeInput(attachRecipeLabelDraft(input(), draft), {
      savedId: 'recipe-a',
      versionId: 'version-a',
      versionNumber: 1,
    });
    expect(useRecipeStore.getState().labelDraft).toEqual(draft);

    useRecipeStore.getState().loadRecipeInput(input(), {
      savedId: 'recipe-b',
      versionId: 'version-b',
      versionNumber: 2,
    });
    expect(useRecipeStore.getState().labelDraft).toBeNull();
  });
});
