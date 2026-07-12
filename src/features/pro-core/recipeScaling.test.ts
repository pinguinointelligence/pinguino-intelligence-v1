import { describe, expect, it } from 'vitest';
import { computeComposition, type EngineIngredient, type RecipeInput, type RecipeItem } from '@/engine';
import {
  CREAM_30,
  DEXTROSE,
  MILK_3_5,
  SUCROSE,
  type ReferenceIngredient,
} from '@/engine/__fixtures__/externalReference/referenceProfiles';
import { buildRecipeVersion } from './recipeVersioning';
import type { RecipeVersion } from './recipeContracts';
import { allocateUnits, scaleRecipeVersion, scaledRecipeInput, type ExactScaleResult } from './recipeScaling';

const NOW = '2026-07-12T10:00:00.000Z';
const TRACE = { engineVersion: 'e1', configVersion: 'c1' };

function ingredient(ref: ReferenceIngredient, id: string): EngineIngredient {
  return {
    id,
    name: ref.ingredient_name,
    category: 'dairy',
    composition: ref.composition,
    pod_value: ref.pod_value,
    pac_value: ref.pac_value,
    de_value: null,
    cost_per_kg: null,
    confidence_score: 100,
    source_type: 'verified_db',
    is_verified: true,
  };
}

function line(ref: ReferenceIngredient, id: string, grams: number): RecipeItem {
  return { id, ingredient: ingredient(ref, id), planned_grams: grams, actual_grams: null, lock_type: 'unlocked' };
}

function version(items: RecipeItem[], batch: number): RecipeVersion {
  const recipeInput: RecipeInput = {
    items,
    mode: 'classic',
    category: 'milk_gelato',
    target_temperature_c: -11,
    target_batch_grams: batch,
    machine_capacity_grams: null,
  };
  return buildRecipeVersion(
    { recipeId: 'r', ownerUserId: 'u', versionNumber: 1, recipeInput, trace: TRACE, source: 'manual', createdBy: 'u', createdAt: NOW },
    'ver-1',
  );
}

/** A realistic verified milk base (decimal source grams). */
const MILK_BASE = () =>
  version(
    [
      line(MILK_3_5, 'milk', 523.5),
      line(CREAM_30, 'cream', 263.5),
      line(SUCROSE, 'sucrose', 123.4),
      line(DEXTROSE, 'dextrose', 38.3),
    ],
    948.7,
  );

const canonicalUnitsSum = (r: ExactScaleResult) =>
  r.lines.reduce((s, l) => s + Math.round(l.grams * 10 ** r.canonicalDecimals), 0);
const displayUnitsSum = (r: ExactScaleResult) =>
  r.lines.reduce((s, l) => s + Math.round(l.displayGrams * 10 ** r.displayDecimals), 0);

describe('allocateUnits — deterministic largest-remainder, exact integer total', () => {
  it('splits three equal sources with no drift (334/333/333)', () => {
    expect(allocateUnits([1, 1, 1], 1000)).toEqual([334, 333, 333]);
    expect(allocateUnits([1, 1, 1], 100)).toEqual([34, 33, 33]);
  });
  it('always totals the requested units exactly', () => {
    const alloc = allocateUnits([523.5, 263.5, 123.4, 38.3], 1_234_000);
    expect(alloc.reduce((s, u) => s + u, 0)).toBe(1_234_000);
  });
  it('handles empty + zero-mass inputs safely', () => {
    expect(allocateUnits([], 5)).toEqual([]);
    expect(allocateUnits([0, 0], 10)).toEqual([0, 0]);
  });
});

describe('scaleRecipeVersion — exact totals at multiple batch sizes', () => {
  for (const target of [1234, 4750, 12500, 50, 250000]) {
    it(`scales to exactly ${target} g on both the canonical and display grids`, () => {
      const res = scaleRecipeVersion(MILK_BASE(), { kind: 'weight_g', grams: target });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // canonical grid (milligrams) totals exactly — integer equality, no drift
      expect(canonicalUnitsSum(res)).toBe(Math.round(target * 1000));
      expect(res.canonicalTotalG).toBe(target);
      // display grid (0.1 g) totals exactly
      expect(displayUnitsSum(res)).toBe(Math.round(target * 10));
      expect(res.displayTotalG).toBe(target);
      // identity + trace preserved
      expect(res.lines.map((l) => l.id)).toEqual(['milk', 'cream', 'sucrose', 'dextrose']);
      expect(res.engineVersion).toBe('e1');
      expect(res.configVersion).toBe('c1');
      expect(res.recipeVersionId).toBe('ver-1');
    });
  }

  it('awkward residual: whole-gram display of three equal lines still totals exactly', () => {
    const v = version([line(SUCROSE, 'a', 100), line(SUCROSE, 'b', 100), line(SUCROSE, 'c', 100)], 300);
    const res = scaleRecipeVersion(v, { kind: 'weight_g', grams: 1000 }, { displayDecimals: 0 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.lines.map((l) => l.displayGrams)).toEqual([334, 333, 333]);
    expect(res.lines.reduce((s, l) => s + l.displayGrams, 0)).toBe(1000);
  });

  it('scaling never mutates the source version', () => {
    const v = MILK_BASE();
    const before = JSON.stringify(v);
    scaleRecipeVersion(v, { kind: 'weight_g', grams: 5000 });
    expect(JSON.stringify(v)).toBe(before);
  });
});

describe('scaleRecipeVersion — Engine composition invariance', () => {
  it('scaled percentages match the source within Engine tolerance', () => {
    const v = MILK_BASE();
    const res = scaleRecipeVersion(v, { kind: 'weight_g', grams: 4750 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const before = computeComposition(v.recipeInput.items).percentages;
    const after = computeComposition(scaledRecipeInput(v, res).items).percentages;
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(Math.abs(after[key] - before[key]), key).toBeLessThan(1e-3);
    }
  });
});

describe('scaleRecipeVersion — honest refusals (no invented conversions)', () => {
  it('refuses volume scaling without a density (needs_more_information)', () => {
    const res = scaleRecipeVersion(MILK_BASE(), { kind: 'volume_ml', ml: 1000 });
    expect(res).toMatchObject({ ok: false, reason: 'needs_more_information', missing: ['density_g_per_ml'] });
  });
  it('accepts volume scaling when a density is supplied', () => {
    const res = scaleRecipeVersion(MILK_BASE(), { kind: 'volume_ml', ml: 1000, densityGPerMl: 1.1 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.requestedBatchG).toBe(1100);
  });
  it('refuses portion scaling without a portion weight (needs_more_information)', () => {
    const res = scaleRecipeVersion(MILK_BASE(), { kind: 'portions', count: 20 });
    expect(res).toMatchObject({ ok: false, reason: 'needs_more_information', missing: ['portion_weight_g'] });
  });
  it('accepts portion scaling when a portion weight is supplied', () => {
    const res = scaleRecipeVersion(MILK_BASE(), { kind: 'portions', count: 20, portionWeightG: 80 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.requestedBatchG).toBe(1600);
  });
  it('refuses a non-positive target and a zero-mass source (invalid)', () => {
    expect(scaleRecipeVersion(MILK_BASE(), { kind: 'weight_g', grams: 0 })).toMatchObject({ ok: false, reason: 'invalid' });
    const empty = version([line(SUCROSE, 'a', 0)], 1);
    expect(scaleRecipeVersion(empty, { kind: 'weight_g', grams: 1000 })).toMatchObject({ ok: false, reason: 'invalid' });
  });
});
