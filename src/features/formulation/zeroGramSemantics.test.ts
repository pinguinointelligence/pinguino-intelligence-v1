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
    expect(isEffectivelyLockedLine(line('l', MILK, 0, 'grams'), { mode: 'locked', grams: 0 })).toBe(
      true,
    );
  });
});

describe('OWNER TEST A — Gelato from 0 g selected lines (artifact-locked fruit)', () => {
  // OWNER FINAL INTEGRATION ADDENDUM items 1+2 (2026-07-25) — SUPERSEDES „the
  // strawberries become > 0" for the DAIRY fruit gelato. Two structural facts
  // changed under it: (1) `fruit_gelato` has no NATIVE seeded bands, so a dairy
  // recipe containing fruit is canonical `milk_gelato`; (2) the only template
  // that ever handed such a recipe a fruit dose — `fruit_gelato_ref_v1`, grams
  // transcribed verbatim from a QA fixture — is quarantined, and no APPROVED
  // milk_gelato template carries a `fruit` role.
  //
  // THE GUARANTEE THIS TEST EXISTS TO PROTECT is the owner's live failure:
  // „the fruit stayed 0 g while the toolbox filled everything else" — i.e. a
  // chosen ingredient must never be SILENTLY ignored. It is re-pinned here in
  // its strongest form: PI refuses to produce that recipe at all and names the
  // exact ingredient it needs an amount for. The predicate semantics
  // (artifact-lock ≠ explicit zero) are unchanged and still pinned above.
  it('the chosen fruit is NEVER silently left at 0 g — PI stops and names it', () => {
    // The exact poisoned state from the screenshots: fruit wears an artifact
    // grams-lock at 0 (no constraint entry), milk is unlocked at 0.
    const rec = input(
      [line('l-straw', STRAWBERRIES, 0, 'grams'), line('l-milk', MILK, 0)],
      'milk_gelato',
    );
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('missing_required_role');
    if (result.code !== 'missing_required_role') return;
    expect(result.role).toBe('fruit');
    expect(result.messagePl).toContain('STRAWBERRIES');
    expect(result.messagePl).toContain('Wpisz ilość');
  });

  it('once the fruit has an amount, everything else fills and the batch is exact', () => {
    const rec = input(
      [line('l-straw', STRAWBERRIES, 350, 'grams'), line('l-milk', MILK, 0)],
      'milk_gelato',
    );
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    const grams = (id: string) => p.proposedInput.items.find((i) => i.id === id)?.planned_grams;
    expect(grams('l-straw')!).toBeGreaterThan(0);
    expect(grams('l-milk')!).toBeGreaterThan(0); // THE owner failure, still fixed
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
  it('strawberries > 0; required support added, optional Inulin absent; NO dairy; 1000 g', () => {
    const rec = input([line('l-straw', STRAWBERRIES, 0, 'grams')], 'sorbet');
    const result = buildOptimizePreview(rec, NO, 'now');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.preview;
    expect(p.proposedInput.items.find((i) => i.id === 'l-straw')!.planned_grams).toBeGreaterThan(0);
    const byIng = (ing: string) =>
      p.proposedInput.items.find((i) => i.ingredient.id === ing)?.planned_grams ?? 0;
    for (const support of ['water', 'sucrose', 'dextrose', 'tara_gum']) {
      expect(byIng(support)).toBeGreaterThan(0);
    }
    expect(byIng('inulin')).toBe(0);
    expect(p.formulation?.recommendations.some((r) => r.role === 'fiber_body')).toBe(true);
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

  // Category updated to the canonical family (owner addendum item 1): the
  // routing guarantee under test is unchanged.
  it('router: artifact zero-lock does NOT drive constrained routing; explicit lock does', () => {
    const artifact = input(
      [line('l-straw', STRAWBERRIES, 0, 'grams'), line('l-milk', MILK, 0)],
      'milk_gelato',
    );
    expect(routeFormulationMode(artifact, NO).mode).toBe('full_formulation');
    const explicit = { byLineId: { 'l-straw': { mode: 'locked' as const, grams: 0 } } };
    expect(routeFormulationMode(artifact, explicit).mode).toBe('constrained_reformulation');
  });
});

describe('load healing — stored artifact locks become unlocked on open', () => {
  it('loadRecipeInput normalizes grams-lock@0 to unlocked (UI shows the truth)', () => {
    useRecipeStore
      .getState()
      .loadRecipeInput(
        input(
          [line('l-straw', STRAWBERRIES, 0, 'grams'), line('l-milk', MILK, 380, 'grams')],
          'milk_gelato',
        ),
      );
    const items = useRecipeStore.getState().items;
    expect(items.find((i) => i.id === 'l-straw')!.lock_type).toBe('unlocked'); // healed
    expect(items.find((i) => i.id === 'l-milk')!.lock_type).toBe('grams'); // real lock kept
  });
});
