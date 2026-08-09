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
import { calculateRecipe, TARGET_BANDS, type RecipeInput, type RecipeItem } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import {
  NATIVE_BAND_CATEGORIES,
  VISIBLE_PRODUCT_TYPES,
  canonicalInternalCategory,
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
    for (const legacy of [
      'Milk gelato',
      'Fruit gelato',
      'Nut gelato',
      'Chocolate gelato',
      'Alcohol gelato',
      'Custom',
    ]) {
      expect(html).not.toContain(legacy);
    }
    expect(html).not.toContain('data-testid="product-type-chocolate"');
  });

  // OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — SUPERSEDES the
  // „alcohol > chocolate > nut > fruit" routing priority. `alcohol_gelato`,
  // `nut_gelato` and `fruit_gelato` carry NO native seeded band cell, so every
  // result routed there was scored on substituted milk_gelato bands wearing a
  // `category_fallback` flag. Alcohol, nuts and fruit are FLAVOUR COMPONENTS of
  // a canonical family, never families. The guarantee this test protects —
  // internal routing happens silently, none of it ever becomes a VISIBLE type —
  // is re-pinned below on the canonical (native-banded) categories.
  it('3. chocolate/alcohol/nut route internally, silently, and only to NATIVE cells', () => {
    const items = [line('l-milk', 'milk_3_5', 700), line('l-choc', 'dark_chocolate_70', 100)];
    expect(gelatoInternalCategory(items)).toBe('chocolate_gelato');
    expect(visibleTypeOf('chocolate_gelato')).toBe('gelato');
    expect(detectClassifications(items).chocolate).toBe(true);
    // Alcohol + fruit are flavour components: chocolate still owns the routing,
    // and the result is a NATIVE cell (never the unseeded alcohol_gelato).
    const withAll = [...items, line('l-whi', 'whiskey_40', 20), line('l-rasp', 'raspberry', 50)];
    expect(gelatoInternalCategory(withAll)).toBe('chocolate_gelato');
    expect(detectClassifications(withAll).alcohol).toBe(true); // detected, just not a family
    expect(visibleTypeOf(gelatoInternalCategory(withAll))).toBe('gelato');
    // A whiskey gelato with no chocolate is a plain milk gelato (native bands).
    expect(
      gelatoInternalCategory([line('l-milk', 'milk_3_5', 700), line('l-whi', 'whiskey_40', 70)]),
    ).toBe('milk_gelato');
    // A pistachio gelato likewise — nuts are a flavour component.
    expect(
      gelatoInternalCategory([
        line('l-milk', 'milk_3_5', 700),
        line('l-pist', 'pistachio_paste', 150),
      ]),
    ).toBe('milk_gelato');
  });

  // OWNER ADDENDUM item 1 — THE STRUCTURAL GATE, driven off the engine's own
  // seeded-cell list so seeding a new cell in targets.ts automatically unlocks
  // it here with no test edit.
  it('no runtime derivation path can return a category without NATIVE seeded bands', () => {
    const seeded = new Set(
      TARGET_BANDS.filter((band) => band.status === 'seeded').map((band) => band.category),
    );
    expect([...NATIVE_BAND_CATEGORIES].sort()).toEqual([...seeded].sort());

    const catalogue = [
      'milk_3_5',
      'cream_30',
      'smp',
      'sucrose',
      'dextrose',
      'tara_gum',
      'raspberry',
      'dark_chocolate_70',
      'pistachio_paste',
      'whiskey_40',
      'water',
      'inulin',
    ];
    // Every non-empty subset of a representative catalogue, through every
    // visible type and every previous category the store could be carrying.
    const subsets: RecipeItem[][] = [[]];
    for (const id of catalogue) {
      const ing = findDemoIngredient(id);
      if (!ing) continue;
      for (const existing of [...subsets]) {
        subsets.push([...existing, line(`l-${id}`, id, 100)]);
      }
    }
    const ALL_CATEGORIES: RecipeInput['category'][] = [
      'milk_gelato',
      'fruit_gelato',
      'nut_gelato',
      'chocolate_gelato',
      'alcohol_gelato',
      'sorbet',
      'vegan_gelato',
      'custom',
      'protein_gelato',
    ];
    for (const items of subsets) {
      // (a) the live gelato derivation
      expect(
        seeded.has(gelatoInternalCategory(items)),
        JSON.stringify(items.map((i) => i.id)),
      ).toBe(true);
      // (b) the visible-type derivation, for every supported visible type
      for (const visible of VISIBLE_PRODUCT_TYPES) {
        expect(seeded.has(internalCategoryFor(visible, items, 'milk_gelato'))).toBe(true);
      }
      // (c) the canonicalization of anything arriving from outside
      for (const category of ALL_CATEGORIES) {
        expect(seeded.has(canonicalInternalCategory(category, items)), category).toBe(true);
      }
    }
  });

  it('the store re-routes internal category live as GELATO ingredients change', () => {
    useRecipeStore.getState().loadRecipeInput({
      items: [line('l-milk', 'milk_3_5', 700)],
      mode: 'classic',
      category: 'milk_gelato',
      target_temperature_c: -11,
      target_batch_grams: 1000,
      machine_capacity_grams: null,
      goals: { flavor_intensity: 'balanced', cost_priority: 'balanced' },
    });
    useRecipeStore.getState().setVisibleProductType('gelato');
    useRecipeStore.getState().addIngredient(findDemoIngredient('dark_chocolate_70')!, 100);
    expect(useRecipeStore.getState().category).toBe('chocolate_gelato');
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato'); // visible stays Gelato
  });

  it('Protein uses its dedicated seeded category and renders the real target control', () => {
    useRecipeStore.getState().setCategory('milk_gelato');
    useRecipeStore.getState().setVisibleProductType('protein');
    expect(useRecipeStore.getState().visibleProductType).toBe('protein');
    expect(useRecipeStore.getState().category).toBe('protein_gelato');
    expect(internalCategoryFor('protein', [], 'sorbet')).toBe('protein_gelato');
    expect(useRecipeStore.getState().target_protein_percent).toBe(20);
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
    const cases: [string, number][] = [
      ['fresh', -11],
      ['temp_minus_11', -11],
      ['temp_minus_12', -12],
      ['temp_minus_13', -13],
    ];
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

describe('new Pro profile layout', () => {
  it('exposes four stable right-panel contexts and keeps actual batch in the profile', () => {
    const profile = read('features', 'pro-workbench', 'RecipeProfilePanel.tsx');
    for (const label of ['Profil receptury', 'Monitor', 'Produkcja', 'Podsumowanie']) {
      expect(profile).toContain(label);
    }
    expect(profile).toContain(
      "export type CockpitTab = 'profile' | 'monitor' | 'production' | 'summary'",
    );
    const settings = read('features', 'pro-workbench', 'WorkbenchSettingsLine.tsx');
    expect(settings).toContain('profile-batch-combined');
    expect(settings).toContain('actualBatchG.toLocaleString');
  });

  it('shows explicit gram and percent lock controls through the canonical lock_type action', () => {
    const row = read('features', 'ingredient-builder', 'IngredientRow.tsx');
    expect(row).toContain('row-lock-grams-');
    expect(row).toContain('row-lock-percent-');
    expect(row).toContain("gramsLocked ? 'unlocked' : 'grams'");
    expect(row).toContain('Blokada udziału procentowego nie jest jeszcze podłączona do solvera.');
    expect(row).toContain('disabled');
  });
});

/* ------------------------------------------ round-trip + engine equality (11–12) -- */
describe('saved round-trip + engine equality', () => {
  const base = (
    temp: number,
    category: RecipeInput['category'],
    extra: RecipeItem[] = [],
  ): RecipeInput => ({
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
    [
      'chocolate-routed gelato',
      base(-12, 'chocolate_gelato', [line('l-choc', 'dark_chocolate_70', 80)]),
    ],
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
      useRecipeStore
        .getState()
        .loadRecipeInput(draftInput, { savedId: 'r', savedName: 'X', versionNumber: 1 });
      const reopenedInput = buildRecipeInput(useRecipeStore.getState());
      const reopenedResult = calculateRecipe(reopenedInput);

      // Identical canonical input (ingredients, grams, category, temperature, batch)…
      expect(
        reopenedInput.items.map((i) => [i.id, i.planned_grams]),
        label,
      ).toEqual(draftInput.items.map((i) => [i.id, i.planned_grams]));
      expect(reopenedInput.category, label).toBe(draftInput.category);
      expect(reopenedInput.target_temperature_c, label).toBe(draftInput.target_temperature_c);
      // …and identical Engine output (the workbench never presents a different number).
      expect(JSON.stringify(reopenedResult), label).toBe(JSON.stringify(draftResult));
    }
  });

  it('the reopened visible type projects correctly from the saved internal category', () => {
    useRecipeStore
      .getState()
      .loadRecipeInput(base(-12, 'chocolate_gelato', [line('l-choc', 'dark_chocolate_70', 80)]));
    expect(useRecipeStore.getState().visibleProductType).toBe('gelato');
    useRecipeStore
      .getState()
      .loadRecipeInput(base(-12, 'sorbet', [line('l-rasp', 'raspberry', 300)]));
    expect(useRecipeStore.getState().visibleProductType).toBe('sorbet');
  });
});

/* -------------------------------------------------- language (proof 13) -- */
describe('language', () => {
  it('13. the core workbench GOAL card carries no legacy English labels', () => {
    const html = renderToStaticMarkup(<GoalSetup />);
    for (const legacy of [
      'Product Mode',
      'Machine capacity',
      'Cost priority',
      'Flavor intensity',
      'Category',
      'Mouthfeel',
    ]) {
      expect(html, legacy).not.toContain(legacy);
    }
    expect(html).toContain('Poziom jakości');
    expect(html).toContain('Typ produktu');
  });
});
