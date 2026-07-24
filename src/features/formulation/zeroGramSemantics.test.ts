/**
 * ZERO-GRAM SELECTED INGREDIENT SEMANTICS (owner live-failure repair).
 * The owner's staging screenshots: STRAWBERRIES at 0 g wearing an ARTIFACT
 * grams-lock (from a saved v1 / dropdown, with NO §17 constraint) stayed 0 g
 * while the toolbox filled everything else. Binding rule: selected + 0 g +
 * no explicit constraint = „chosen but unfilled" → formulation fills it.
 * Explicit zero (padlock constraint {locked, grams:0}) stays honored.
 */
import { describe, expect, it } from 'vitest';
import type { EngineIngredient, RecipeInput } from '@/engine';
import { findDemoIngredient } from '@/data/demoIngredients';
import { buildOptimizePreview, plannedSum } from '@/features/constraint-studio/applyPipeline';
import { useRecipeStore } from '@/stores/recipeStore';
import { isEffectivelyLockedLine, routeFormulationMode } from './formulate';

const STRAWBERRIES: EngineIngredient = {
  ...findDemoIngredient('raspberry')!,
  id: 'PI-ING-001553',
  name: 'STRAWBERRIES · Fresh Fruit',
  category: 'fruit',
};
const MILK = findDemoIngredient('milk_3_5')!;

const line = (
  id: string,
  ingredient: EngineIngredient,
  grams: number,
  lock: 'unlocked' | 'grams' = 'unlocked',
) => ({ id, ingredient, planned_grams: grams, actual_grams: null, lock_type: lock as 'unlocked' });

const input = (
  items: ReturnType<typeof line>[],
  category: RecipeInput['category'],
): RecipeInput => ({
  mode: 'classic',
  category,
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  items,
});

const NO = { byLineId: {} };

describe('isEffectivelyLockedLine — the binding predicate', () => {
  it('bare grams-lock at 0 g without a constraint = NOT locked (selected-unfilled)', () => {
    expect(isEffectivelyLockedLine(line('l', MILK, 0, 'grams'), undefined)).toBe(false);
  });
  it('grams-lock at positive grams stays a hard lock', () => {
    expect(isEffectivelyLockedLine(line('l', MILK, 500, 'grams'), undefined)).toBe(true);
  });
  it('explicit §17 zero constraint stays a hard lock', () => {
    expect(
      isEffectivelyLockedLine(line('l', MILK, 0, 'grams'), { mode: 'locked', grams: 0 }),
    ).toBe(true);
  });
});

describe('OWNER TEST A — Gelato from 0 g selected lines (artifact-locked fruit)', () => {
  it('strawberries AND milk both become > 0; all support roles; exactly 1000 g', () => {
    // The exact poisoned state from the screenshots: fruit wears an artifact
    // grams-lock at 0 (no constraint entry), milk is unlocked at 0.
    const rec = input(
      [line('l-straw', STRAWBERRIES, 0, 'grams'), line('l-milk', MILK, 0)],
      'fruit_gelato',
    );
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    const grams = (id: string) => p.proposedInput.items.find((i) => i.id === id)?.planned_grams;
    expect(grams('l-straw')!).toBeGreaterThan(0); // THE owner failure
    expect(grams('l-milk')!).toBeGreaterThan(0);
    const byIng = (ing: string) =>
      p.proposedInput.items.find((i) => i.ingredient.id === ing)?.planned_grams ?? 0;
    for (const support of ['cream_30', 'smp', 'sucrose', 'dextrose', 'tara_gum']) {
      expect(byIng(support)).toBeGreaterThan(0);
    }
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    const ids = p.proposedInput.items.map((i) => i.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    // no misleading „fruit role is 0 g" recommendation
    expect(p.formulation?.recommendations.some((r) => r.role === 'fruit')).toBe(false);
    expect(p.formulation?.missingRoles ?? []).not.toContain('fruit');
  });
});

describe('OWNER TEST B — Sorbet from 0 g selected fruit', () => {
  it('strawberries > 0; water/sucrose/dextrose/inulin/tara added; NO dairy; 1000 g', () => {
    const rec = input([line('l-straw', STRAWBERRIES, 0, 'grams')], 'sorbet');
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    expect(p.proposedInput.items.find((i) => i.id === 'l-straw')!.planned_grams).toBeGreaterThan(0);
    const byIng = (ing: string) =>
      p.proposedInput.items.find((i) => i.ingredient.id === ing)?.planned_grams ?? 0;
    for (const support of ['water', 'sucrose', 'dextrose', 'inulin', 'tara_gum']) {
      expect(byIng(support)).toBeGreaterThan(0);
    }
    for (const dairy of ['milk_3_5', 'cream_30', 'smp']) {
      expect(byIng(dairy)).toBe(0);
    }
    expect(Math.abs(plannedSum(p.proposedInput) - 1000)).toBeLessThanOrEqual(0.1);
    expect(p.formulation?.recommendations.some((r) => r.role === 'fruit')).toBe(false);
  });
});

describe('OWNER TEST C — explicit zero lock / exclusion still respected', () => {
  it('inulin padlocked at 0 (§17 constraint) stays 0 with the honest note', () => {
    const rec = input(
      [
        line('l-straw', STRAWBERRIES, 600),
        line('l-water', findDemoIngredient('water') ?? STRAWBERRIES, 181),
        line('l-suc', findDemoIngredient('sucrose')!, 103.8),
        line('l-dex', findDemoIngredient('dextrose')!, 59),
        line('l-inulin', findDemoIngredient('inulin')!, 0, 'grams'),
        line('l-tara', findDemoIngredient('tara_gum')!, 0.8),
      ],
      'sorbet',
    );
    const set = { byLineId: { 'l-inulin': { mode: 'locked' as const, grams: 0 } } };
    const result = buildOptimizePreview(rec, set, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inulin = result.preview.proposedInput.items.find((i) => i.id === 'l-inulin')!;
    expect(Object.is(inulin.planned_grams, 0)).toBe(true);
    expect(result.preview.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(
      true,
    );
  });

  it('router: artifact zero-lock does NOT drive constrained routing; explicit lock does', () => {
    const artifact = input(
      [line('l-straw', STRAWBERRIES, 0, 'grams'), line('l-milk', MILK, 0)],
      'fruit_gelato',
    );
    expect(routeFormulationMode(artifact, NO).mode).toBe('full_formulation');
    const explicit = { byLineId: { 'l-straw': { mode: 'locked' as const, grams: 0 } } };
    expect(routeFormulationMode(artifact, explicit).mode).toBe('constrained_reformulation');
  });
});

describe('load healing — stored artifact locks become unlocked on open', () => {
  it('loadRecipeInput normalizes grams-lock@0 to unlocked (UI shows the truth)', () => {
    useRecipeStore.getState().loadRecipeInput(
      input([line('l-straw', STRAWBERRIES, 0, 'grams'), line('l-milk', MILK, 380, 'grams')], 'fruit_gelato'),
    );
    const items = useRecipeStore.getState().items;
    expect(items.find((i) => i.id === 'l-straw')!.lock_type).toBe('unlocked'); // healed
    expect(items.find((i) => i.id === 'l-milk')!.lock_type).toBe('grams'); // real lock kept
  });
});
