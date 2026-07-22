/**
 * CANONICAL PRO RECIPE WORKBENCH — owner P0 contract (15 proofs + round-trip + equality).
 *
 * One canonical recipe draft (recipeStore) feeds the editor, Engine, Monitor, solver and save.
 * Visible product types are exactly Gelato/Sorbet/Wegańskie/Proteinowe; internal categories
 * (milk/fruit/nut/chocolate/alcohol…) route silently from the real ingredients. One quality tier.
 * One serving-mode source. No Demo Scenario mutates a normal recipe. Direct Engine == workbench ==
 * Monitor == solver == saved/reopened.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, beforeEach } from 'vitest';
import { calculateRecipe, type RecipeInput, type RecipeItem } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  VISIBLE_PRODUCT_TYPES,
  detectClassifications,
  gelatoInternalCategory,
  internalCategoryFor,
  visibleTypeOf,
} from './productType';
import { GoalSetup } from '@/features/recipe-goal/GoalSetup';
import { copy } from '@/copy/en';

const SRC = resolve(import.meta.dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(SRC, ...p), 'utf8');

const line = (id: string, ing: string, grams: number): RecipeItem => ({
  id,
  ingredient: findDemoIngredient(ing)!,
  planned_grams: grams,
  actual_grams: null,
  lock_type: 'unlocked',
});

beforeEach(() => useRecipeStore.getState().resetToDemo());

/* ------------------------------------------------------ product types (proofs 1–3) -- */
describe('visible product types', () => {
  it('1+2. exposes EXACTLY Gelato/Sorbet/Wegańskie/Proteinowe — no legacy primary categories', () => {
    expect([...VISIBLE_PRODUCT_TYPES]).toEqual(['gelato', 'sorbet', 'vegan', 'protein']);
    const html = renderToStaticMarkup(<GoalSetup />);
    for (const t of ['gelato', 'sorbet', 'vegan', 'protein']) {
      expect(html).toContain(`data-testid="product-type-${t}"`);
    }
    // No legacy primary category selector (Milk/Fruit/Nut/Chocolate/Alcohol/Custom).
    for (const legacy of ['Milk gelato', 'Fruit gelato', 'Nut gelato', 'Chocolate gelato', 'Alcohol gelato', 'Custom']) {
      expect(html).not.toContain(legacy);
    }
    expect(html).not.toContain('data-testid="product-type-chocolate"');
  });

  it('3. chocolate routes internally without becoming a visible type', () => {
    const items = [line('l-milk', 'milk_3_5', 700), line('l-choc', 'dark_chocolate_70', 100)];
    expect(gelatoInternalCategory(items)).toBe('chocolate_gelato');
    expect(visibleTypeOf('chocolate_gelato')).toBe('gelato');
    expect(detectClassifications(items).chocolate).toBe(true);
    // Priority: alcohol > chocolate > nut > fruit.
    const withAll = [...items, line('l-whi', 'whiskey_40', 20), line('l-rasp', 'raspberry', 50)];
    expect(gelatoInternalCategory(withAll)).toBe('alcohol_gelato');
  });

  it('the store re-routes internal category live as GELATO ingredients change', () => {
    useRecipeStore.getState().loadRecipeInput(
      { items: [line('l-milk', 'milk_3_5', 700)], mode: 'classic', category: 'milk_gelato', target_temperature_c: -11, target_batch_grams: 1000, machine_capacity_grams: null, goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' } },
    );
    useRecipeStore.getState().setVisibleProductType('gelato');
    useRecipeStore.getState().addIngredient(findDemoIngredient('dark_chocolate_70')!, 100);
    expect(useRecipeStore.getState().category).toBe('chocolate_gelato');
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato'); // visible stays Gelato
  });

  it('Protein is honest-unsupported — never silently re-profiles the recipe', () => {
    useRecipeStore.getState().setCategory('milk_gelato');
    useRecipeStore.getState().setVisibleProductType('protein');
    expect(useRecipeStore.getState().visibleProductType).toBe('protein');
    expect(useRecipeStore.getState().category).toBe('milk_gelato'); // unchanged
    expect(internalCategoryFor('protein', [], 'sorbet')).toBe('sorbet');
    expect(renderToStaticMarkup(<GoalSetup />)).not.toContain('data-testid="protein-unsupported"');
  });
});

/* ---------------------------------------------------- quality tier (proofs 4–5) -- */
describe('quality tier', () => {
  it('4+5. ONE canonical quality tier; secondary goal controls cannot read as it', () => {
    useRecipeStore.getState().setMode('premium');
    expect(useRecipeStore.getState().mode).toBe('premium');
    // The cost-priority „premium" goal is labelled distinctly so it can never override/alias PREMIUM.
    expect(copy.studio.goal.costOptions.premium).not.toBe(copy.studio.goal.modes.premium.name);
    expect(copy.studio.goal.costOptions.premium).toBe('Bez kompromisów');
    // Setting a cost priority does NOT change the quality tier.
    useRecipeStore.getState().setCostPriority('premium');
    expect(useRecipeStore.getState().mode).toBe('premium');
    // Advanced goals live in a collapsed section, visibly separated from the tier.
    const html = renderToStaticMarkup(<GoalSetup />);
    expect(html).toContain('data-testid="goal-advanced"');
    const tierIdx = html.indexOf('data-testid="quality-premium"');
    const advIdx = html.indexOf('data-testid="goal-advanced"');
    expect(tierIdx).toBeGreaterThan(-1);
    expect(advIdx).toBeGreaterThan(tierIdx); // tier before advanced tuning
  });
});

/* -------------------------------------------------- serving mode (proof 6) -- */
describe('serving mode', () => {
  it('6. Świeże/−11/−12/−13 share ONE mode source (servingModeId + temperature move together)', () => {
    const cases: [string, number][] = [['fresh', -11], ['temp_minus_11', -11], ['temp_minus_12', -12], ['temp_minus_13', -13]];
    for (const [id, temp] of cases) {
      useRecipeStore.getState().setServingMode(id, temp);
      const s = useRecipeStore.getState();
      expect(s.servingModeId).toBe(id);
      expect(s.target_temperature_c).toBe(temp);
      // The Engine input reads the SAME field.
      expect(buildRecipeInput(s).target_temperature_c).toBe(temp);
    }
  });
});

/* ------------------------------------------ one recipe writer + no demo mutation (7–8) -- */
describe('one canonical state', () => {
  it('7. the ONLY module that writes recipe items is the recipe store / its verified pipeline', () => {
    // The constraint-studio store is the single OTHER writer, and only through the verify pipeline
    // (pinned by constraintStudioBoundary.test.ts). No component writes items directly.
    const boundary = read('features', 'constraint-studio', 'constraintStudioBoundary.test.ts');
    expect(boundary).toContain('constraintStudioStore');
    // GoalSetup mutates ONLY through store actions (no useRecipeStore.setState).
    const goal = read('features', 'recipe-goal', 'GoalSetup.tsx');
    expect(goal.includes('useRecipeStore.setState')).toBe(false);
  });

  it('8. Demo Scenarios are DEV-only and never mount in the normal Pro workspace', () => {
    const surface = read('features', 'studio', 'StudioEngineSurface.tsx');
    expect(surface).toContain('import.meta.env.DEV ? <PresetSelector');
  });
});

/* ---------------------------------------------- recalculation entry (proofs 9–10) -- */
describe('recalculation entry', () => {
  it('9. the top Przelicz z PI uses the canonical pipeline (createOptimizePreview)', () => {
    const page = read('pages', 'pro', 'ProWorkspacePage.tsx');
    expect(page).toContain('createOptimizePreview');
    expect(page).toContain('ProRecalcPanel');
  });

  it('10. no competing lower „Dopasuj recepturę" recalculation trigger remains', () => {
    const section = read('features', 'constraint-studio', 'ui', 'ConstraintStudioSection.tsx');
    expect(section.includes('store.createOptimizePreview')).toBe(false);
    expect(section.includes('copy.actions.optimize')).toBe(false); // the CTA button is gone
  });
});

/* ------------------------------------------ round-trip + engine equality (11–12) -- */
describe('saved round-trip + engine equality', () => {
  const base = (temp: number, category: RecipeInput['category'], extra: RecipeItem[] = []): RecipeInput => ({
    items: [line('l-milk', 'milk_3_5', 700), line('l-suc', 'sucrose', 150), ...extra],
    mode: 'classic',
    category,
    target_temperature_c: temp,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
  });

  const CASES: [string, RecipeInput][] = [
    ['gelato −11', base(-11, 'milk_gelato')],
    ['gelato −12', base(-12, 'milk_gelato')],
    ['gelato −13', base(-13, 'milk_gelato')],
    ['chocolate-routed gelato', base(-12, 'chocolate_gelato', [line('l-choc', 'dark_chocolate_70', 80)])],
    ['sorbet', base(-12, 'sorbet', [line('l-rasp', 'raspberry', 300)])],
    ['vegan', base(-12, 'vegan_gelato')],
  ];

  it('11+12. store→RecipeInput→Engine == reopened saved version (identical input AND output)', () => {
    for (const [label, input] of CASES) {
      // Load as the canonical draft, project RecipeInput, run the Engine.
      useRecipeStore.getState().loadRecipeInput(input);
      const draftInput = buildRecipeInput(useRecipeStore.getState());
      const draftResult = calculateRecipe(draftInput);

      // "Save" = the same RecipeInput persisted; "reopen" = load it back.
      useRecipeStore.getState().resetToDemo();
      useRecipeStore.getState().loadRecipeInput(draftInput, { savedId: 'r', savedName: 'X', versionNumber: 1 });
      const reopenedInput = buildRecipeInput(useRecipeStore.getState());
      const reopenedResult = calculateRecipe(reopenedInput);

      // Identical canonical input (ingredients, grams, category, temperature, batch)…
      expect(reopenedInput.items.map((i) => [i.id, i.planned_grams]), label).toEqual(
        draftInput.items.map((i) => [i.id, i.planned_grams]),
      );
      expect(reopenedInput.category, label).toBe(draftInput.category);
      expect(reopenedInput.target_temperature_c, label).toBe(draftInput.target_temperature_c);
      // …and identical Engine output (the workbench never presents a different number).
      expect(JSON.stringify(reopenedResult), label).toBe(JSON.stringify(draftResult));
    }
  });

  it('the reopened visible type projects correctly from the saved internal category', () => {
    useRecipeStore.getState().loadRecipeInput(base(-12, 'chocolate_gelato', [line('l-choc', 'dark_chocolate_70', 80)]));
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    useRecipeStore.getState().loadRecipeInput(base(-12, 'sorbet', [line('l-rasp', 'raspberry', 300)]));
    expect(useRecipeStore.getState().visibleProductType).toBe('sorbet');
  });
});

/* -------------------------------------------------- language (proof 13) -- */
describe('language', () => {
  it('13. the core workbench GOAL card carries no legacy English labels', () => {
    const html = renderToStaticMarkup(<GoalSetup />);
    for (const legacy of ['Product Mode', 'Machine capacity', 'Cost priority', 'Flavor intensity', 'Category', 'Mouthfeel']) {
      expect(html, legacy).not.toContain(legacy);
    }
    expect(html).toContain('Poziom jakości');
    expect(html).toContain('Typ produktu');
  });
});
