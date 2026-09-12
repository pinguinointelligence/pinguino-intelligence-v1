import { beforeEach, describe, expect, it } from 'vitest';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { intentProfileFor } from './homeProfileMapping';
import { presentLoadedRecipeInHome } from './homeLoadedRecipe';
import { isStageReachable, EMPTY_HOME_FLOW_ANSWERS } from './homeStageFlow';

const chip = { id: 'c1', label: 'kakao', productId: 'PI-ING-001579' } as unknown as IntentChip;

describe('a recipe loaded elsewhere opens in HOME as its recipe', () => {
  beforeEach(() => {
    useRecipeStore.getState().resetToDemo();
    useHomeDraftStore.getState().startNew();
  });

  it('starts a fresh HOME draft around the loaded recipe and opens the recipe stage', () => {
    useHomeDraftStore.setState({ chips: [chip] });
    presentLoadedRecipeInHome({
      label: 'Ciemna czekolada',
      officialRecipeId: 'classic-dark-chocolate',
    });
    const draft = useHomeDraftStore.getState();
    expect(draft.chips).toEqual([]);
    expect(draft.intentSubmitted).toBe(true);
    expect(draft.recipeReady).toBe(true);
    expect(draft.profile).toBe(intentProfileFor(useRecipeStore.getState().visibleProductType));
    expect(draft.derivedFromOfficialRecipeId).toBe('classic-dark-chocolate');
    expect(draft.derivedFromPublicationId).toBeNull();
    expect(draft.derivedFromLabel).toBe('Ciemna czekolada');
    expect(
      isStageReachable('recipe', { ...EMPTY_HOME_FLOW_ANSWERS, recipeReady: draft.recipeReady }),
    ).toBe(true);
  });

  it('keeps the customer idea when the recipe was chosen from it', () => {
    useHomeDraftStore.setState({ chips: [chip] });
    presentLoadedRecipeInHome({ label: 'QA Gelato', publicationId: 'pub-1', keepIdea: true });
    const draft = useHomeDraftStore.getState();
    expect(draft.chips).toHaveLength(1);
    expect(draft.recipeReady).toBe(true);
    expect(draft.derivedFromPublicationId).toBe('pub-1');
  });

  it('never touches the loaded recipe itself', () => {
    const before = structuredClone(useRecipeStore.getState().items);
    presentLoadedRecipeInHome({});
    expect(useRecipeStore.getState().items).toEqual(before);
  });
});
