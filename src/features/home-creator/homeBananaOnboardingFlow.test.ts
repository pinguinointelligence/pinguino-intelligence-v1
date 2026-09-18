import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateRecipe } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';
import { materializeCanonicalToolboxIngredient } from '@/data/ingredients/canonicalToolboxIngredient';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { useRecipeStore } from '@/stores/recipeStore';
import { useHomeDraftStore, type IntentChip } from './homeDraftStore';
import { EMPTY_HOME_FLOW_ANSWERS, visibleStages } from './homeStageFlow';

const BANANA_ID = 'PI-ING-000345';
const PAGE = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const MACHINE = readFileSync('src/features/home-creator/ui/HomeMachineSection.tsx', 'utf8');

const resolvedBanana: IntentChip = {
  id: 'home-banana-flow',
  label: 'banan',
  concept: 'banana',
  role: null,
  source: 'text',
  productId: BANANA_ID,
  productName: 'BANANA · Fresh Fruit',
  ambiguous: false,
};

describe('HOME banana onboarding → first recipe', () => {
  it('HOME-BANANA-FLOW-02: the exact PI identity survives the onboarding answers', () => {
    useHomeDraftStore.getState().startNew();
    useHomeDraftStore.getState().addChip(resolvedBanana);
    useHomeDraftStore.getState().submitIntent();
    useHomeDraftStore.getState().setProfile('gelato');
    useHomeDraftStore.getState().presentStage('machine');

    expect(useHomeDraftStore.getState().chips).toContainEqual(resolvedBanana);
    expect(PAGE).toMatch(
      /onSelectMachine=\{\(selected\) => \{[\s\S]*?setMachine\(selected\)[\s\S]*?onAmountChange=\{\(next\) => \{[\s\S]*?setAmount\(next\)/,
    );
  });

  it('HOME-BANANA-FLOW-03: onboarding Gotowe starts the existing canonical first solve', () => {
    const done = PAGE.slice(
      PAGE.indexOf('onDone={() => {'),
      PAGE.indexOf('onBack={', PAGE.indexOf('onDone={() => {')),
    );
    const firstSolve = PAGE.slice(
      PAGE.indexOf('const finishInitialRecipe'),
      PAGE.indexOf('/** §57:', PAGE.indexOf('const finishInitialRecipe')),
    );

    expect(done).toContain('generateRecipe(amount)');
    // „Gotowe” is the customer answering: it may retry a set that failed, and it
    // records the start through the one tested gate (HOME-GEN-LOOP).
    expect(done).toContain('generation.current = generationStarted(key, generationRetried());');
    expect(PAGE).toContain("!draft.presentedStages.includes('machine')");
    expect(firstSolve).toContain('runPiRecalculationWithTerminal()');
    expect(firstSolve.indexOf('runPiRecalculationWithTerminal()')).toBeLessThan(
      firstSolve.indexOf('markRecipeReady(true)'),
    );
  });

  it('HOME-BANANA-FLOW-04: the calculated first recipe retains canonical Fresh Banana', () => {
    useRecipeStore.getState().resetToDemo();
    useRecipeStore.getState().rebuildNewRecipeStarter({
      visibleProductType: 'sorbet',
      servingModeId: 'temp_minus_11',
      formulationStrategy: 'optimal',
      targetBatchGrams: 450,
    });
    const banana = materializeCanonicalToolboxIngredient(BANANA_ID);
    expect(banana).not.toBeNull();
    useRecipeStore.getState().addIngredient(banana!, 90, { amountIntent: 'user_exact' });

    expect(() => calculateRecipe(buildRecipeInput(useRecipeStore.getState()))).not.toThrow();
    expect(
      useRecipeStore
        .getState()
        .items.find((line) => canonicalIngredientId(line.ingredient) === BANANA_ID),
    ).toMatchObject({
      ingredient: {
        id: BANANA_ID,
        canonical_ingredient_id: BANANA_ID,
        name: 'BANANA · Fresh Fruit',
      },
    });
  });

  it('HOME-BANANA-FLOW-05: no-default flow still requires profile, machine and amount', () => {
    const beforeProfile = visibleStages({
      ...EMPTY_HOME_FLOW_ANSWERS,
      hasIntent: true,
      intentSubmitted: true,
    });
    const beforeMachine = visibleStages({
      ...EMPTY_HOME_FLOW_ANSWERS,
      hasIntent: true,
      intentSubmitted: true,
      hasProfile: true,
    });

    expect(beforeProfile).toContain('profile');
    expect(beforeMachine).toContain('machine');
    expect(MACHINE).toContain('data-testid="home-amount"');
    expect(MACHINE).toContain('data-testid="home-machine-done"');
  });
});
