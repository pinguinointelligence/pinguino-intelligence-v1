/**
 * DESIGN V3.0 HOME recipe screen — the PAGE keeps every rule of the add flow; only the
 * presentation moved.
 *
 * A product picked from „+ Składnik” / „+ Topping” opens the recipe's ingredient panel
 * instead of „Ile chcesz dodać?” (IV-C). The runtime of that panel is covered by
 * `HomeIngredientPanel.runtime.test.tsx` and `homeRecipeScreen.runtime.test.tsx`; this file
 * pins the page wiring that decides WHICH products reach it and HOW a confirmed amount
 * becomes a line — so the usage-role question (§58), the automatic priority / Crown rules
 * (PACKAGE 2A: `grantAutomaticPriority`, `decideAddAmount`), the topping default amount
 * (`toppingCreationDefaultGrams`) and the automatic PRZELICZ stay exactly where they were.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const section = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
const recalc = readFileSync('src/features/home-creator/ui/HomeRecalculate.tsx', 'utf8');
const share = readFileSync('src/features/community/ui/ShareRecipeDialog.tsx', 'utf8');
const publish = readFileSync('src/features/community/ui/PublishToCommunityDialog.tsx', 'utf8');

const handleAdd = page.slice(
  page.indexOf('const handleAddIngredient = useCallback('),
  page.indexOf('/** The first build (or the customer'),
);

describe('the add flow keeps its rules — only the presentation moved', () => {
  it('§58: a product that is genuinely both is placed first (the usage-role question)', () => {
    expect(handleAdd).toContain('decideUsageRole(behavior ?? null)');
    expect(handleAdd).toContain("usage.kind === 'ask'");
    expect(handleAdd).toContain('setPendingUsage(');
    expect(page).toContain('<HomeUsagePrompt');
  });

  it('PACKAGE 2A: the amount decision and the automatic priority are unchanged', () => {
    expect(handleAdd).toContain('decideAddAmount(behavior ?? null, productRecommendedDosagePl, {');
    expect(handleAdd).toContain(
      'autoPriority: autoPriorityAppliesToNewLine(useRecipeStore.getState().priority_mode)',
    );
    expect(handleAdd).toContain("decision.kind === 'unresolved_authority'");
    expect(handleAdd).toContain("decision.kind === 'ask_amount'");
    // Crown decides → the 0 g line through the one Base door, which grants the priority.
    expect(handleAdd).toContain('addIngredientLine(ingredient, behavior ?? null, 0)');
    expect(page).toContain('useRecipeStore.getState().grantAutomaticPriority(added.lineId)');
  });

  it("a topping's question starts at the canonical default amount", () => {
    expect(page).toContain(
      'initialGrams: toppingCreationDefaultGrams(useRecipeStore.getState().items)',
    );
  });

  it('a product picked for the open recipe is answered in the recipe panel, not the prompt', () => {
    expect(page).toContain(".filter((entry) => entry.source === 'live')");
    expect(page).toContain('pendingAmounts={recipePendingAmounts}');
    // The prompt stays for the first build's questions (before a recipe is on screen).
    expect(page).toContain(
      "{pendingAdd && (pendingAdd.source === 'initial' || !recipeOnScreen) ? (",
    );
  });

  it('a confirmed amount becomes a line through the SAME doors, from either surface', () => {
    const confirm = page.slice(
      page.indexOf('const confirmPendingAdd = useCallback('),
      page.indexOf('const cancelPendingAdd = useCallback('),
    );
    expect(confirm).toContain('addConfirmedTopping(');
    expect(confirm).toContain(
      'addIngredientLine(pendingAdd.ingredient, pendingAdd.behavior, grams)',
    );
    expect(page).toContain('onConfirm={(grams) => confirmPendingAdd(pendingAdd, grams)}');
    expect(page).toContain('if (waiting) confirmPendingAdd(waiting, grams);');
  });

  it('the automatic PRZELICZ waits while the ingredient panel is open, like any question', () => {
    expect(page).toContain(
      'if (pendingAdd !== null || pendingUsage !== null || recipeEditorOpen) return;',
    );
    expect(page).toContain('onEditorOpenChange={setRecipeEditorOpen}');
  });
});

describe('the recipe screen actions use the existing doors', () => {
  it('„Zaczynamy” is the existing make handler', () => {
    expect(page).toContain("onLetsMakeIt={() => requestFinalAction('make')}");
  });

  it('„Reset” is the Recipes hub new-draft door for HOME', () => {
    const reset = page.slice(
      page.indexOf('const resetToEmptyStart = () => {'),
      page.indexOf('/** §35'),
    );
    expect(reset).toContain('startNewProRecipe(');
    expect(reset).toContain('useHomeDraftStore.getState().startNew();');
    expect(page).toContain('onReset={resetToEmptyStart}');
  });

  it('production: „Wróć do produkcji” returns to the running batch', () => {
    expect(page).toContain("productionStatus !== 'completed'");
    expect(page).toContain("onResumeProduction={() => scrollToStage('preparation')}");
  });

  it('sweetness keeps its one setter (§61/§62)', () => {
    expect(page).toContain('onSweetness={onSweetness}');
    expect(page).toContain('if (!tapChangesStoredValue(stored, choice)) return;');
    expect(section).toContain('onChoose={onSweetness}');
  });
});

describe('XIII — every HOME sheet is the HOME layer', () => {
  it('„Przelicz i popraw”, Udostępnij, Community and the save question', () => {
    expect(recalc).toContain('placement="home-layer"');
    expect(page).toContain('frame="home-layer"');
    expect(page).toContain('placement="home-layer"');
    expect(page).toContain('testId="home-save-before-share"');
    expect(share).toContain("frame === 'home-layer'");
    expect(publish).toContain('placement={placement}');
  });

  it('other callers of the shared dialogs keep their frame by default', () => {
    expect(share).toContain("frame = 'default'");
    expect(publish).toContain("placement = 'responsive'");
  });
});
