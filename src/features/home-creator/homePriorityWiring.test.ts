/**
 * PACKAGE 2A — the HOME wiring, source-invariant.
 *
 * The store tests prove what the actions do; these prove HOME calls the right
 * door at the right moment, and that nothing in PRO was taught a HOME rule.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const page = read('src/pages/home/HomeCreatorPage.tsx');
const intent = read('src/features/home-creator/useHomeIntentIngredients.ts');
const section = read('src/features/home-creator/ui/HomeRecipeSection.tsx');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.tsx?$/.test(name) && !/\.test\./.test(name)
        ? [full]
        : [];
  });

describe('PACKAGE 2A — HOME wiring', () => {
  it('a new HOME draft is started in AUTO after the starter rebuild and before the chips', () => {
    const rebuild = page.indexOf('rebuildNewRecipeStarter({');
    const auto = page.indexOf("setPriorityMode('AUTO')");
    const ready = page.indexOf('markRecipeReady(true)', rebuild);
    const chips = page.indexOf('addResolvedChip(chip)', rebuild);
    expect(rebuild).toBeGreaterThan(-1);
    expect(auto).toBeGreaterThan(rebuild);
    expect(auto).toBeLessThan(ready);
    expect(auto).toBeLessThan(chips);
  });

  it('both HOME add paths use the AUTOMATIC door, never the conscious crown', () => {
    expect(page).toContain('grantAutomaticPriority(added.lineId)');
    expect(intent).toContain('grantAutomaticPriority(added.lineId)');
    expect(page).not.toMatch(/setMainIngredient\(added\.lineId/);
    expect(intent).not.toMatch(/setMainIngredient\(added\.lineId/);
  });

  it('HOME shows only the crowns the customer set', () => {
    expect(page).toContain(
      'crownLineIds={visibleCrownLineIds(recipe.items, recipe.priority_mode)}',
    );
  });

  it("HOME's Crown control stays the HOME surface's own conscious door", () => {
    expect(section).toMatch(/setLockType\(lineId, isMain \? 'unlocked' : 'main', 'home'\)/);
  });

  it('in MANUAL the recipe-screen add asks the amount (both add paths pass the mode)', () => {
    const asks =
      page.match(
        /autoPriority: autoPriorityAppliesToNewLine\(useRecipeStore\.getState\(\)\.priority_mode\)/g,
      ) ?? [];
    expect(asks.length).toBe(2);
  });

  it("HOME's padlock names HOME's surface, so a lock never ends AUTO", () => {
    const homeSurface =
      /setLockType\(\s*item\.id,\s*item\.lock_type === 'grams' \? 'unlocked' : 'grams',\s*'home',?\s*\)/g;
    expect(section.match(homeSurface)?.length).toBe(2);
    expect(section).not.toMatch(
      /setLockType\(\s*item\.id,\s*item\.lock_type === 'grams' \? 'unlocked' : 'grams'\s*\)/,
    );
  });

  it('in MANUAL the intent/scanner door makes no 0 g BASE line — the page asks the amount', () => {
    expect(intent).toMatch(
      /!\(grams > 0\)\s*&&\s*!autoPriorityAppliesToNewLine\(useRecipeStore\.getState\(\)\.priority_mode\)/,
    );
    expect(intent).toContain("return { chipId: key, status: 'needs_amount', ingredient };");
    expect(page).toContain('askAmountFor(await intentIngredients.addResolvedChip(chip))');
    expect(page).toContain('intentIngredients.addResolvedChip(resolved).then(askAmountFor)');
    expect(page).toContain('intentIngredients.addScannedProduct(product.id).then(askAmountFor)');
    expect(page).toContain(
      'setPendingAdd({ ingredient: outcome.ingredient, behavior: null, recommendedDose: null })',
    );
  });

  it('only the HOME page starts a draft in AUTO', () => {
    const callers = walk('src').filter(
      (file) => !file.endsWith('recipeStore.ts') && read(file).includes('setPriorityMode('),
    );
    expect(callers).toEqual([join('src', 'pages', 'home', 'HomeCreatorPage.tsx')]);
  });

  it("OWNER OD-1: HOME's recalculation hands every 0 g priority line to the solver as the bootstrap", () => {
    const recalc = read('src/features/home-creator/ui/HomeRecalculate.tsx');
    expect(recalc).toContain(
      'homeRecalculationInstructions(useRecipeStore.getState().items, instructions)',
    );
    expect(recalc).toContain('customerInstructions(preview.previewInstructions?.lines ?? [])');
    expect(recalc).not.toContain('onClick={() => void runPiRecalculationWithTerminal()}');
  });

  it('OWNER OD-3: both HOME topping paths start at 5 % of the BASE', () => {
    expect(page).toContain('defaultHomeToppingGrams(useRecipeStore.getState().items)');
    expect(intent).toContain('defaultHomeToppingGrams(store.items)');
  });

  it('every product that needs an amount gets its own question', () => {
    expect(page).toContain('queueAmountQuestion(queue, next)');
    expect(page).toContain('key={pendingAdd.ingredient.id}');
  });

  it('save / reopen keeps the mode through one marker, at every save door', () => {
    const canonical = read('src/features/recipes/useCanonicalRecipeSave.ts');
    const studio = read('src/features/constraint-studio/ui/SaveVersionControl.tsx');
    const store = read('src/stores/recipeStore.ts');
    expect(canonical).toContain('withSavedPriorityMode(saved, state.priority_mode)');
    expect(studio).toContain('withSavedPriorityMode(engineInput, draft.priority_mode)');
    expect(store).toContain('priority_mode: savedPriorityMode(input),');
  });

  it('no PRO file knows the HOME priority mode', () => {
    const pro = [
      ...walk('src/features/ingredient-builder'),
      ...walk('src/features/pro-core'),
      ...walk('src/features/pro-workbench'),
      ...walk('src/pages/pro'),
    ];
    for (const file of pro) {
      const src = read(file);
      expect(src, file).not.toMatch(/priority_mode|grantAutomaticPriority|setPriorityMode/);
    }
  });
});
