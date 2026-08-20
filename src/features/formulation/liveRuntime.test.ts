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
  // OWNER FINAL INTEGRATION ADDENDUM items 1+2 (2026-07-25) — SUPERSEDES the
  // `fruit_gelato` expectations this block carried. `fruit_gelato` has no NATIVE
  // seeded bands (targets.ts seeds milk/chocolate/sorbet/vegan only), so a dairy
  // recipe containing fruit is canonical GELATO → `milk_gelato`. The guarantee
  // this test exists to protect — the CURRENT draft (never a stale/saved one)
  // controls routing, and the workbar shows the VISIBLE type — is re-pinned
  // below on the canonical category.
  it('the CURRENT draft controls routing; workbar and selector agree on the visible type', () => {
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    const s = useRecipeStore.getState();
    // Visible = Gelato; internal derives the CANONICAL dairy family from the
    // real ingredients (milk present ⇒ dairy ⇒ milk_gelato, NATIVE bands).
    expect(s.visibleProductType).toBe('gelato');
    expect(s.category).toBe('milk_gelato');
    // The workbar renders the VISIBLE type — never a private internal label.
    expect(copy.studio.goal.productTypes[s.visibleProductType]).toBe('Gelato');
    // RecipeInput (the formulation source) is the CURRENT draft.
    expect(buildRecipeInput(s).category).toBe('milk_gelato');
  });

  // OWNER ADDENDUM items 1+2 — SUPERSEDES „produces a REAL differentiated
  // preview" for the ZERO-GRAM fruit case. The only template that ever gave a
  // dairy fruit gelato a fruit dose was `fruit_gelato_ref_v1`, whose grams were
  // transcribed from a QA fixture; item 2 quarantines it, and no APPROVED
  // milk_gelato template carries a `fruit` role. PI must therefore not invent a
  // fruit dose — and must not silently return a plain milk base either. The
  // guarantee is re-pinned in its strongest form: the chosen fruit is NEVER
  // silently left at 0 g; PI stops and names it. The companion test below
  // re-pins that a fruit gelato WITH grams still formulates completely.
  it('a 0 g fruit is never silently ignored: PI stops and asks for the amount', () => {
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(preview).toBeNull(); // never a milk base pretending the fruit is not there
    expect(previewIssue?.code).toBe('missing_required_role');
    if (previewIssue?.code !== 'missing_required_role') return;
    expect(previewIssue.role).toBe('fruit');
    expect(previewIssue.messagePl).toContain('STRAWBERRIES');
    expect(previewIssue.messagePl).toContain('Wpisz ilość');
  });

  it('with a real fruit amount it formulates completely on NATIVE milk bands', () => {
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 350);
    useConstraintStudioStore.getState().createOptimizePreview();
    const { preview, previewIssue } = useConstraintStudioStore.getState();
    expect(previewIssue).toBeNull();
    expect(preview).not.toBeNull();
    if (!preview) return;
    expect(preview.formulation?.templateId).toBe('milk_base_v1');
    // An APPROVED template — never reference-derived (addendum item 2).
    expect(preview.formulation?.templateStatus).toBe('approved');
    expect(Math.abs(plannedSum(preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    // the USER's stable ids carry real differentiated grams
    const milk = preview.proposedInput.items.find((i) => i.ingredient.id === 'milk_3_5')!;
    const straw = preview.proposedInput.items.find((i) => i.ingredient.id === 'PI-ING-001553')!;
    expect(milk.planned_grams).toBeGreaterThan(100);
    expect(straw.planned_grams).toBeGreaterThan(0); // the user's fruit is preserved
    expect(milk.planned_grams).not.toBe(straw.planned_grams); // differentiated
    // the toolbox supplied the technological base — visible with reasons
    const addedIds = preview.formulation!.added.map((a) => a.ingredientId);
    expect(addedIds).toEqual(
      expect.arrayContaining(['cream_30', 'smp', 'sucrose', 'dextrose', 'tara_gum']),
    );
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
    expect(addedIds).toEqual(expect.arrayContaining(['water', 'sucrose', 'dextrose', 'tara_gum']));
    expect(addedIds).not.toContain('inulin');
    expect(preview.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);
    expect(preview.proposedInput.items.some((i) => i.ingredient.id === 'milk_3_5')).toBe(false); // no dairy
    const straw = preview.proposedInput.items.find((i) => i.ingredient.id === 'PI-ING-001553')!;
    expect(straw.planned_grams).toBeGreaterThan(300);
  });

  // OWNER FINAL INTEGRATION ADDENDUM item 1 (2026-07-25) — SUPERSEDES the
  // `fruit_gelato` / `fruit_gelato_ref_v1` expectations. The owner rule: a
  // WATER-BASED NON-DAIRY fruit recipe is a SORBET even when it was entered
  // under visible Gelato (there is no dairy anywhere in this draft — the dairy
  // test reads real composition, not names). The guarantee this test protects —
  // switching the visible type re-routes the template INSTANTLY from the
  // current draft, with no save — is re-pinned below, plus the new rule.
  it('switching Sorbet → Gelato keeps a non-dairy fruit draft on the SORBET science (test 4)', () => {
    resetStore('sorbet');
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 0);
    useRecipeStore.getState().setVisibleProductType('gelato');
    // no dairy anywhere ⇒ canonical family is sorbet, whatever the selector said
    expect(useRecipeStore.getState().category).toBe('sorbet');
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview?.formulation?.templateId).toBe('S01');
  });

  it('adding real dairy re-routes the SAME draft to the milk family instantly (test 4b)', () => {
    resetStore('sorbet');
    useRecipeStore.getState().addIngredient(STRAWBERRIES, 350);
    useRecipeStore.getState().setVisibleProductType('gelato');
    expect(useRecipeStore.getState().category).toBe('sorbet'); // still no dairy
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    // dairy now present ⇒ instant re-route, no save needed
    expect(useRecipeStore.getState().category).toBe('milk_gelato');
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview?.formulation?.templateId).toBe(
      'milk_base_v1',
    );
  });
});

// Owner FINAL CLOSURE C2 (2026-07-24) — SUPERSEDES the earlier removal-
// excludes rule this block pinned: removal no longer excludes (it removes the
// row from the CURRENT recipe only). The EXPLICIT `markIngredientUnavailable`
// action is now the ONLY exclusion source; the frozen never-reintroduce and
// explicit-add-clears pins below are unchanged.
describe('exclusion semantics (EXPLICIT unavailable ≠ removed ≠ never-selected)', () => {
  it('optional Inulin is recommendation-only and explicit unavailable remains respected', () => {
    // Fresh draft: owner policy keeps absent Inulin at 0 and recommends it.
    resetStore('gelato');
    useRecipeStore.setState({ target_temperature_c: -12, category: 'milk_gelato' });
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useConstraintStudioStore.getState().createOptimizePreview();
    const fresh = useConstraintStudioStore.getState().preview;
    expect(fresh?.formulation?.added.some((a) => a.ingredientId === 'inulin')).toBe(false);
    expect(fresh?.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);

    // Now the user marks inulin EXPLICITLY unavailable → excluded → never re-added.
    useConstraintStudioStore.getState().cancelPreview();
    useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 0);
    const inulinLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'inulin')!;
    useRecipeStore.getState().markIngredientUnavailable(inulinLine.id);
    expect(useRecipeStore.getState().items.some((i) => i.ingredient.id === 'inulin')).toBe(false);
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('PI-ING-000456');
    useConstraintStudioStore.getState().createOptimizePreview();
    const after = useConstraintStudioStore.getState().preview;
    expect(after).not.toBeNull();
    expect(after?.proposedInput.items.some((i) => i.ingredient.id === 'inulin')).toBe(false);
    expect(after?.formulation?.missingRoles).toContain('fiber_body');
    expect(after?.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);

    // Explicitly adding it back clears the exclusion (frozen pin).
    useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 0);
    expect(useRecipeStore.getState().excludedIngredientIds).not.toContain('PI-ING-000456');
  });

  it('a merely removed optional Inulin stays absent and is recommended', () => {
    resetStore('gelato');
    useRecipeStore.setState({ target_temperature_c: -12, category: 'milk_gelato' });
    useRecipeStore.getState().addIngredient(findDemoIngredient('milk_3_5')!, 0);
    useRecipeStore.getState().addIngredient(findDemoIngredient('inulin')!, 0);
    const inulinLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'inulin')!;
    useRecipeStore.getState().removeItem(inulinLine.id);
    expect(useRecipeStore.getState().excludedIngredientIds).toEqual([]);
    useConstraintStudioStore.getState().createOptimizePreview();
    const after = useConstraintStudioStore.getState().preview;
    expect(after).not.toBeNull();
    expect(after?.formulation?.added.some((a) => a.ingredientId === 'inulin')).toBe(false);
    expect(after?.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);
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
