import { beforeEach, describe, expect, it } from 'vitest';
import type { RecipeInput } from '@/engine';
import { DEFAULT_PRESET } from '@/data/demoPresets';
import { recipePersistPartialize, useRecipeStore } from '@/stores/recipeStore';
import {
  RECIPE_PROVENANCE_KEY,
  attachRecipeProvenance,
  readRecipeProvenance,
  type RecipeProvenance,
} from './recipeProvenance';
import { adoptWorkingCopy } from './workingCopy';

const input = (): RecipeInput => ({
  items: structuredClone(DEFAULT_PRESET.items),
  mode: DEFAULT_PRESET.mode,
  category: DEFAULT_PRESET.category,
  target_temperature_c: DEFAULT_PRESET.target_temperature_c,
  target_batch_grams: DEFAULT_PRESET.target_batch_grams,
  machine_capacity_grams: null,
});

const OFFICIAL: RecipeProvenance = {
  schemaVersion: 1,
  kind: 'official',
  officialRecipeId: 'classic-dark-chocolate',
  officialRecipeNumber: 1,
  sourceName: 'Ciemna czekolada',
  libraryVersion: 'official-177-v1',
  librarySha256: 'a'.repeat(64),
};
const COMMUNITY: RecipeProvenance = {
  schemaVersion: 1,
  kind: 'community',
  relation: 'copy',
  publicationId: 'pub-1',
  shareLinkId: null,
  sourceTitle: 'QA Gelato',
  sourceCreatorDisplayName: 'Anna QA',
  sourceVersionNumber: 3,
};

describe('the provenance sidecar', () => {
  it('round-trips both kinds through the saved recipe input', () => {
    for (const provenance of [OFFICIAL, COMMUNITY]) {
      expect(readRecipeProvenance(attachRecipeProvenance(input(), provenance))).toEqual(provenance);
    }
  });

  it('attaches nothing to an own recipe', () => {
    expect(RECIPE_PROVENANCE_KEY in attachRecipeProvenance(input(), null)).toBe(false);
    expect(readRecipeProvenance(input())).toBeNull();
  });

  it('reads anything malformed as no provenance — never a guess', () => {
    const malformed: unknown[] = [
      { ...OFFICIAL, schemaVersion: 2 },
      { ...OFFICIAL, officialRecipeId: '' },
      { ...OFFICIAL, officialRecipeNumber: 1.5 },
      { ...COMMUNITY, relation: 'fork' },
      { ...COMMUNITY, publicationId: null },
      { ...COMMUNITY, shareLinkId: 'share-1' },
      'official',
      null,
    ];
    for (const value of malformed) {
      expect(readRecipeProvenance({ ...input(), [RECIPE_PROVENANCE_KEY]: value })).toBeNull();
    }
  });
});

describe('recipe store provenance lifecycle', () => {
  beforeEach(() => useRecipeStore.getState().resetToDemo());

  it('a working copy is an unsaved draft that carries its source', () => {
    adoptWorkingCopy({
      input: input(),
      name: 'Ciemna czekolada',
      composition: null,
      provenance: OFFICIAL,
    });
    const state = useRecipeStore.getState();
    expect(state.savedRecipeId).toBeNull();
    expect(state.currentVersionNumber).toBeNull();
    expect(state.savedRecipeName).toBe('Ciemna czekolada');
    expect(state.dirty).toBe(false);
    expect(state.provenance).toEqual(OFFICIAL);
    expect(recipePersistPartialize(state).provenance).toEqual(OFFICIAL);
  });

  it('reopening a saved copy restores its provenance; an own recipe has none', () => {
    useRecipeStore.getState().loadRecipeInput(attachRecipeProvenance(input(), COMMUNITY), {
      savedId: 'rc-1',
      savedName: 'Moja wersja',
      versionNumber: 2,
    });
    expect(useRecipeStore.getState().provenance).toEqual(COMMUNITY);
    useRecipeStore.getState().loadRecipeInput(input(), {
      savedId: 'rc-2',
      savedName: 'Własna',
      versionNumber: 1,
    });
    expect(useRecipeStore.getState().provenance).toBeNull();
  });

  it('a new recipe forgets the previous source', () => {
    adoptWorkingCopy({ input: input(), name: 'X', composition: null, provenance: OFFICIAL });
    useRecipeStore.getState().startNewRecipe();
    expect(useRecipeStore.getState().provenance).toBeNull();
  });
});
