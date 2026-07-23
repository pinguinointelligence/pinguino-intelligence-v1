/**
 * LIVE PRO FORMULATION RUNTIME (owner P0 — served /pro/recipe failure).
 * The owner's exact reproduction: visible Gelato, Milk 3.5% + STRAWBERRIES ·
 * Fresh Fruit, both 0 g, −11 °C, 1000 g → previously the generic rejection.
 * Proves: state consistency (draft controls everything), REAL toolbox
 * auto-fill, exclusion semantics, and the structured rejection detail.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { EngineIngredient } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { copy } from '@/copy/en';
import { useRecipeStore } from '@/stores/recipeStore';
import { buildRecipeInput } from '@/features/studio/buildRecipeInput';
import { plannedSum } from '@/features/constraint-studio/applyPipeline';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';

/** STRAWBERRIES · Fresh Fruit as the live Mapper delivers it (fruit category). */
const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const resetStore = (visible: 'gelato' | 'sorbet') => {
  useRecipeStore.setState({
    mode: 'classic',
    category: 'milk_gelato',
    visibleProductType: 'gelato',
    target_temperature_c: -11,
    target_batch_grams: 1000,
    machine_capacity_grams: null,
    flavor_intensity: 'balanced',
    cost_priority: 'balanced',
    items: [],
    excludedIngredientIds: [],
  });
  useConstraintStudioStore.getState().resetForTests();
  useRecipeStore.getState().setVisibleProductType(visible);
};

beforeEach(() => resetStore('gelato'));

describe('owner case A — Gelato + Milk + Strawberry, no grams (Phase 5)', () => {
  it('the CURRENT draft controls routing; workbar and selector agree on the visible type', () => {
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    const s = useRecipeStore.getState();
    // Visible = Gelato; internal derives fruit_gelato from the real ingredients.
    expect(s.visibleProductType).toBe('gelato');
    expect(s.category).toBe('fruit_gelato');
    // The workbar renders the VISIBLE type — never a private internal label.
    expect(copy.studio.goal.productTypes[s.visibleProductType]).toBe('Gelato');
    // RecipeInput (the formulation source) is the CURRENT draft.
    expect(buildRecipeInput(s).category).toBe('fruit_gelato');
  });

  it('produces a REAL differentiated preview: user IDs preserved, toolbox roles auto-added with reasons', () => {
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.formulation?.mode).toBe('full_formulation');
    expect(preview.formulation?.templateId).toBe('fruit_gelato_ref_v1');
    expect(Math.abs(plannedSum(preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // the USER's stable ids carry real differentiated grams
    const milk = preview.proposedInput.items.find((i) => i.ingredient.id === 'milk_3_5')!;
    const straw = preview.proposedInput.items.find((i) => i.ingredient.id === 'PI-ING-001553')!;
    expect(milk.planned_grams).toBeGreaterThan(100);
    expect(straw.planned_grams).toBeGreaterThan(100);
    expect(milk.planned_grams).not.toBe(straw.planned_grams); // differentiated
    // the toolbox supplied the technological base — visible with reasons
    const addedIds = preview.formulation!.added.map((a) => a.ingredientId);
    expect(addedIds).toEqual(expect.arrayContaining(['cream_30', 'smp', 'sucrose', 'dextrose', 'tara_gum']));
    for (const a of preview.formulation!.added) {
      expect(a.reasonPl).toContain('zatwierdzona receptura');
      expect(a.grams).toBeGreaterThan(0);
    }
    // no duplicates
    const ids = preview.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('owner case B — Sorbet + Strawberry, no grams (Phase 6)', () => {
  it('uses the approved SORBET template (never the milk template) and completes 1000 g', () => {
    resetStore('sorbet');
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    expect(useRecipeStore.getState().category).toBe('sorbet'); // draft controls the route
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.formulation?.templateId).toBe('S01');
    expect(Math.abs(plannedSum(preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    const addedIds = preview.formulation!.added.map((a) => a.ingredientId);
    expect(addedIds).toEqual(expect.arrayContaining(['water', 'sucrose', 'dextrose', 'inulin', 'tara_gum']));
    expect(preview.proposedInput.items.some((i) => i.ingredient.id === 'milk_3_5')).toBe(false); // no dairy
    const straw = preview.proposedInput.items.find((i) => i.ingredient.id === 'PI-ING-001553')!;
    expect(straw.planned_grams).toBeGreaterThan(300);
  });

  it('switching Sorbet → Gelato immediately re-routes the template (test 4)', () => {
    resetStore('sorbet');
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    useRecipeStore.getState().setVisibleProductType('gelato');
    expect(useRecipeStore.getState().category).toBe('fruit_gelato'); // instant, no save needed
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview?.formulation?.templateId).toBe('fruit_gelato_ref_v1');
  });
});

describe('exclusion semantics (removed ≠ never-selected)', () => {
  it('a REMOVED toolbox ingredient is never reintroduced; a fresh draft still gets full auto-fill', () => {
    // Fresh draft: inulin never selected → G17 (−12) auto-fills it (approved toolbox).
    resetStore('gelato');
    useRecipeStore.setState({ target_temperature_c: -12, category: 'milk_gelato' });
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useConstraintStudioStore.getState().createOptimizePreview();
    const fresh = useConstraintStudioStore.getState().preview;
    expect(fresh?.formulation?.added.some((a) => a.ingredientId === 'inulin')).toBe(true);

    // Now the user explicitly REMOVES inulin → excluded → never re-added.
    useConstraintStudioStore.getState().cancelPreview();
    useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 0);
    const inulinLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'inulin')!;
    useRecipeStore.getState().removeItem(inulinLine.id);
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('inulin');
    useConstraintStudioStore.getState().createOptimizePreview();
    const after = useConstraintStudioStore.getState().preview;
    expect(after).not.toBeNull();
    expect(after?.proposedInput.items.some((i) => i.ingredient.id === 'inulin')).toBe(false);
    expect(after?.formulation?.missingRoles).toContain('fiber_body');
    expect(after?.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);

    // Explicitly adding it back clears the exclusion (Phase 3 semantics).
    useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 0);
    expect(useRecipeStore.getState().excludedIngredientIds).not.toContain('inulin');
  });
});

describe('Milk locked at exactly 500 g through the LIVE store path (case E)', () => {
  it('preserves 500.0 g byte-exact and fills the remaining 500 g', () => {
    resetStore('gelato');
    useRecipeStore.setState({ category: 'milk_gelato' });
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 500);
    const milkLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'milk_3_5')!;
    useConstraintStudioStore.getState().toggleLock(milkLine.id); // exact padlock at 500
    useConstraintStudioStore.getState().createOptimizePreview();
    const preview = useConstraintStudioStore.getState().preview;
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.formulation?.mode).toBe('constrained_reformulation');
    const milk = preview.proposedInput.items.find((i) => i.id === milkLine.id)!;
    expect(Object.is(milk.planned_grams, 500)).toBe(true);
    expect(Math.abs(plannedSum(preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
  });
});
