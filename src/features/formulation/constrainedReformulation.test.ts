/**
 * CONSTRAINED REFORMULATION, COMPLETE UNDO, SCALE SAFETY (owner P0 fixtures).
 * The owner's EXACT failing recipes: Sorbet with inulin locked at 0 (944.6 g)
 * and Gelato with milk locked at 500 g (1120 g). The ±25% mass rule is gone —
 * explicit constraints route to constrained full reformulation.
 */
import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { DEFAULT_CORRECTION_CANDIDATES } from '@/engine';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  buildBatchRescalePreview,
  buildOptimizePreview,
  plannedSum,
} from '@/features/constraint-studio/applyPipeline';
import { useConstraintStudioStore } from '@/features/constraint-studio/constraintStudioStore';
import { routeFormulationMode } from './formulate';

const WATER = DEFAULT_CORRECTION_CANDIDATES.find((c) => c.id === 'water')!.ingredient;
const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};

const line = (id: string, ingredient: EngineIngredient, grams: number, lock: 'unlocked' | 'grams' = 'unlocked') => ({
  id,
  ingredient,
  planned_grams: grams,
  actual_grams: null as number | null,
  lock_type: lock as 'unlocked',
});

const input = (items: ReturnType<typeof line>[], category: RecipeInput['category'], temp = -11, batch = 1000): RecipeInput => ({
  mode: 'classic', category, target_temperature_c: temp, target_batch_grams: batch, machine_capacity_grams: null, items,
});

/** FIXTURE A — the owner's exact Sorbet with inulin locked at 0 (total 944.6 g). */
const INULIN_ZERO = () => [
  line('l-straw', STRAWBERRIES, 600),
  line('l-water', WATER, 181),
  line('l-suc', findDemoIngredient('sucrose')!, 103.8),
  line('l-dex', findDemoIngredient('dextrose')!, 59),
  line('l-inulin', findDemoIngredient('inulin')!, 0, 'grams'),
  line('l-tara', findDemoIngredient('tara_gum')!, 0.8),
];
const INULIN_SET = { byLineId: { 'l-inulin': { mode: 'locked' as const, grams: 0 } } };

/** FIXTURE B — the owner's exact Gelato with milk locked at 500 (total 1120 g). */
const MILK_500 = () => [
  line('l-straw', STRAWBERRIES, 350),
  line('l-milk', findDemoIngredient('milk_3_5')!, 500, 'grams'),
  line('l-cream', findDemoIngredient('cream_30')!, 80),
  line('l-smp', findDemoIngredient('smp')!, 40),
  line('l-suc', findDemoIngredient('sucrose')!, 110),
  line('l-dex', findDemoIngredient('dextrose')!, 35),
  line('l-tara', findDemoIngredient('tara_gum')!, 5),
  line('l-water', WATER, 0),
];
const MILK_SET = { byLineId: { 'l-milk': { mode: 'locked' as const, grams: 500 } } };

describe('router — the ±25% rule is GONE (Phase 1 + tests 1/2)', () => {
  it('inulin-0 (944.6 g, 5.5% off) routes to CONSTRAINED reformulation, not local', () => {
    const decision = routeFormulationMode(input(INULIN_ZERO(), 'sorbet'), INULIN_SET);
    expect(decision.mode).toBe('constrained_reformulation');
    expect(decision.template?.templateId).toBe('S01');
  });
  it('milk-500 (1120 g, 12% off) routes to CONSTRAINED reformulation, not local', () => {
    const decision = routeFormulationMode(input(MILK_500(), 'fruit_gelato'), MILK_SET);
    expect(decision.mode).toBe('constrained_reformulation');
    expect(decision.template?.templateId).toBe('fruit_gelato_ref_v1');
  });
  it('a complete at-target unconstrained draft keeps the local basin', () => {
    const items = [
      line('l-milk', findDemoIngredient('milk_3_5')!, 610), line('l-cream', findDemoIngredient('cream_30')!, 150),
      line('l-suc', findDemoIngredient('sucrose')!, 120), line('l-dex', findDemoIngredient('dextrose')!, 60),
      line('l-smp', findDemoIngredient('smp')!, 55), line('l-tara', findDemoIngredient('tara_gum')!, 5),
    ];
    expect(routeFormulationMode(input(items, 'milk_gelato'), { byLineId: {} }).mode).toBe('local_correction');
  });
});

describe('FIXTURE A — inulin unavailable (tests 3/4/5/6)', () => {
  it('inulin stays exactly 0, is never re-added, total returns to 1000 g, recommendation present', () => {
    const result = buildOptimizePreview(input(INULIN_ZERO(), 'sorbet'), INULIN_SET, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    const inulin = p.proposedInput.items.find((i) => i.id === 'l-inulin')!;
    expect(Object.is(inulin.planned_grams, 0)).toBe(true); // binding zero
    expect(p.proposedInput.items.filter((i) => i.ingredient.id === 'inulin').length).toBe(1); // no re-add
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    expect(p.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true); // honest gap
    const ids = p.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the safe suboptimal result APPLIES through the store (test 6 — accept with explanation)', () => {
    useRecipeStore.setState({
      mode: 'classic', category: 'sorbet', visibleProductType: 'sorbet', target_temperature_c: -11,
      target_batch_grams: 1000, machine_capacity_grams: null, flavor_intensity: 'balanced',
      cost_priority: 'balanced', items: INULIN_ZERO(), excludedIngredientIds: [],
    });
    useConstraintStudioStore.getState().resetForTests();
    useConstraintStudioStore.setState({ constraints: INULIN_SET });
    useConstraintStudioStore.getState().createOptimizePreview();
    expect(useConstraintStudioStore.getState().preview).not.toBeNull();
    useConstraintStudioStore.getState().applyPreview();
    expect(useConstraintStudioStore.getState().blocked).toBeNull();
    const items = useRecipeStore.getState().items;
    expect(items.find((i) => i.id === 'l-inulin')!.planned_grams).toBe(0);
    expect(Math.abs(items.reduce((a, i) => a + i.planned_grams, 0) - 1000)).toBeLessThanOrEqual(0.1);
  });
});

describe('FIXTURE B — milk exactly 500 g (tests 7/8/21)', () => {
  it('milk stays 500.0 byte-exact; total becomes exactly 1000 g; differentiated; no duplicates', () => {
    const result = buildOptimizePreview(input(MILK_500(), 'fruit_gelato'), MILK_SET, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    const milk = p.proposedInput.items.find((i) => i.id === 'l-milk')!;
    expect(Object.is(milk.planned_grams, 500)).toBe(true);
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    const grams = p.proposedInput.items.map((i) => Math.round(i.planned_grams));
    expect(new Set(grams).size).toBeGreaterThan(3); // differentiated, not scaled
    const ids = p.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('professional context: machine_capacity null never blocks (test 21)', () => {
    const rec = input(MILK_500(), 'fruit_gelato');
    expect(rec.machine_capacity_grams).toBeNull();
    const result = buildOptimizePreview(rec, MILK_SET, 'now');
    expect(result.ok).toBe(true);
  });
});

describe('FIXTURE E + scale safety (tests 16/17/18)', () => {
  it('target 0 / NaN / negative never produces a preview', () => {
    const rec = input(INULIN_ZERO(), 'sorbet', -11, 1000);
    for (const bad of [0, Number.NaN, -100]) {
      const result = buildBatchRescalePreview(rec, INULIN_SET, bad, 'now');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('rescale_invalid');
    }
  });
  it('944.6 g rescaled to 1000 g never becomes 0 g', () => {
    const rec = input(INULIN_ZERO(), 'sorbet');
    const result = buildBatchRescalePreview(rec, INULIN_SET, 1000, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.abs(plannedSum(result.preview.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    expect(result.preview.proposedInput.items.every((i) => Number.isFinite(i.planned_grams))).toBe(true);
  });
  it('locked 500 g does NOT trigger the locked-sum error against a 1000 g target (test 18)', () => {
    const rec = input(MILK_500(), 'fruit_gelato');
    const result = buildBatchRescalePreview(rec, MILK_SET, 1000, 'now');
    // 500 locked ≤ 1000 target → never rescale_locked_sum
    if (!result.ok) expect(result.code).not.toBe('rescale_locked_sum');
  });
});

describe('FIXTURE D — complete Undo restores exclusions (tests 14/15)', () => {
  it('apply → exclude → reformulate → undo → exclusions restored; second run identical', () => {
    useRecipeStore.setState({
      mode: 'classic', category: 'milk_gelato', visibleProductType: 'gelato', target_temperature_c: -12,
      target_batch_grams: 1000, machine_capacity_grams: null, flavor_intensity: 'balanced',
      cost_priority: 'balanced', items: [line('l-milk', findDemoIngredient('milk_3_5')!, 0)],
      excludedIngredientIds: [],
    });
    useConstraintStudioStore.getState().resetForTests();
    // 1. formulate + apply (G17 auto-fills inulin among others)
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    const firstApplied = JSON.stringify(useRecipeStore.getState().items.map((i) => [i.ingredient.id, i.planned_grams]));
    // 2. remove/exclude the inulin line
    const inulinLine = useRecipeStore.getState().items.find((i) => i.ingredient.id === 'inulin');
    expect(inulinLine).toBeDefined();
    useRecipeStore.getState().removeItem(inulinLine!.id);
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('inulin');
    // 3. reformulate + apply (inulin must NOT return)
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(useRecipeStore.getState().items.some((i) => i.ingredient.id === 'inulin')).toBe(false);
    const secondApplied = JSON.stringify(
      useRecipeStore.getState().items.map((i) => [i.ingredient.id, i.planned_grams]),
    );
    // 4. undo → the exclusion state returns WITH the snapshot (no refresh needed)
    useConstraintStudioStore.getState().undoLastApply();
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('inulin');
    // 5. the FIRST apply cannot be undone across the manual removal (§20.3
    //    stale protection) — the attempt is a safe NO-OP, never a corruption
    const before5 = JSON.stringify(useRecipeStore.getState().items.map((i) => [i.ingredient.id, i.planned_grams]));
    useConstraintStudioStore.getState().undoLastApply();
    expect(JSON.stringify(useRecipeStore.getState().items.map((i) => [i.ingredient.id, i.planned_grams]))).toBe(before5);
    expect(useRecipeStore.getState().excludedIngredientIds).toContain('inulin');
    // 6. reformulating again from the restored state is DETERMINISTIC: the
    //    same exclusions produce the same result, and inulin never returns
    useConstraintStudioStore.getState().createOptimizePreview();
    useConstraintStudioStore.getState().applyPreview();
    expect(JSON.stringify(useRecipeStore.getState().items.map((i) => [i.ingredient.id, i.planned_grams]))).toBe(secondApplied);
    expect(firstApplied).not.toBe(secondApplied); // the exclusion genuinely changed the formulation
  });
});

describe('FIXTURE F — 20 constrained cycles (tests 22/23)', () => {
  it('exact lock + edits over 20 cycles: 1000 g, no duplicates, no stale exclusions', () => {
    useRecipeStore.setState({
      mode: 'classic', category: 'fruit_gelato', visibleProductType: 'gelato', target_temperature_c: -11,
      target_batch_grams: 1000, machine_capacity_grams: null, flavor_intensity: 'balanced',
      cost_priority: 'balanced', items: MILK_500(), excludedIngredientIds: [],
    });
    useConstraintStudioStore.getState().resetForTests();
    useConstraintStudioStore.setState({ constraints: MILK_SET });
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const first = useRecipeStore.getState().items.find((i) => i.lock_type === 'unlocked')!;
      useRecipeStore.getState().setPlannedGrams(first.id, Math.max(0, first.planned_grams - 3));
      useConstraintStudioStore.getState().createOptimizePreview();
      if (useConstraintStudioStore.getState().preview) useConstraintStudioStore.getState().applyPreview();
      const items = useRecipeStore.getState().items;
      expect(useRecipeStore.getState().target_batch_grams).toBe(1000);
      const total = items.reduce((a, i) => a + i.planned_grams, 0);
      expect(total).toBeLessThan(1100);
      // Owner A7 (NIGHTLY): no zero-total corruption across accepted cycles.
      expect(total).toBeGreaterThan(0);
      expect(new Set(items.map((i) => i.ingredient.id)).size).toBe(items.length);
      const milk = items.find((i) => i.id === 'l-milk')!;
      expect(Object.is(milk.planned_grams, 500)).toBe(true); // the lock survives every cycle
    }
  });
});

describe('empty recipe is never balanced (test 20) + science freeze (test 24)', () => {
  it('an empty RecipeInput routes honestly and never reads as complete', () => {
    const empty = input([], 'milk_gelato');
    const decision = routeFormulationMode(empty, { byLineId: {} });
    expect(decision.mode).not.toBe('local_correction'); // 0 g ≠ at-target basin
  });
  it('ENGINE/CONFIG unchanged', async () => {
    const { calculateRecipe } = await import('@/engine');
    const r = calculateRecipe(input([line('l-m', findDemoIngredient('milk_3_5')!, 1000)], 'milk_gelato'));
    expect(r.engine_version).toBe('0.4.0');
    expect(r.config_version).toBe('0.7.0');
  });
});
