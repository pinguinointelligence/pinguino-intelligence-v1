/**
 * MULTI-MAIN RECIPE IDENTITY CONTRACT (owner P0).
 *
 * `lock_type: 'main'` is a per-line role, so every matching line belongs to the
 * Main SET. This module contains formulation-intent checks only: no PAC/POD,
 * target bands, scoring or other Engine science lives here.
 */
import type { RecipeInput } from '@/engine';
import { canonicalIngredientId } from '@/data/ingredients/canonicalIngredientIdentity';

export const MAIN_RATIO_TOLERANCE = 1e-7;
const POSITIVE_GRAMS_EPSILON = 1e-9;

export interface MainIngredientIntentLine {
  lineId: string;
  canonicalIngredientId: string;
  ingredientName: string;
  grams: number;
  /** Explicit product-layer ratio weight, or 1 for the equal-share default. */
  ratioWeight: number;
  ratioExplicit: boolean;
}

export interface MainIdentityViolation {
  code:
    | 'main_line_missing'
    | 'main_canonical_identity_changed'
    | 'main_role_removed'
    | 'main_ingredient_zeroed'
    | 'main_ratio_metadata_changed'
    | 'main_ratio_changed';
  lineIds: string[];
  ingredientNames: string[];
}

export type MainIdentityCheck =
  | { ok: true; mains: MainIngredientIntentLine[]; scaleFactor: number | null }
  | { ok: false; mains: MainIngredientIntentLine[]; violations: MainIdentityViolation[] };

/** Positive, user-entered Main lines in stable draft order. */
export function captureMainIngredientIntent(input: RecipeInput): MainIngredientIntentLine[] {
  return input.items
    .filter((item) => item.lock_type === 'main' && item.planned_grams > POSITIVE_GRAMS_EPSILON)
    .map((item) => ({
      lineId: item.id,
      canonicalIngredientId: canonicalIngredientId(item.ingredient),
      ingredientName: item.ingredient.name,
      grams: item.planned_grams,
      ratioWeight:
        typeof item.main_ratio_weight === 'number' &&
        Number.isFinite(item.main_ratio_weight) &&
        item.main_ratio_weight > 0
          ? item.main_ratio_weight
          : 1,
      ratioExplicit:
        typeof item.main_ratio_weight === 'number' &&
        Number.isFinite(item.main_ratio_weight) &&
        item.main_ratio_weight > 0,
    }));
}

/**
 * Trustless before/after verification used by Preview and the final Apply door.
 * Stable line id + canonical id are both required; row order and display names
 * are deliberately irrelevant.
 */
export function verifyMainIngredientIdentity(
  before: RecipeInput,
  after: RecipeInput,
  byLineId: Readonly<Record<string, MainConstraintLike | undefined>> = {},
): MainIdentityCheck {
  const mains = captureMainIngredientIntent(before);
  if (mains.length === 0) return { ok: true, mains, scaleFactor: null };

  const afterByLineId = new Map(after.items.map((item) => [item.id, item]));
  const violations: MainIdentityViolation[] = [];
  const survivingGrams: number[] = [];

  for (const main of mains) {
    const next = afterByLineId.get(main.lineId);
    if (!next) {
      violations.push({
        code: 'main_line_missing',
        lineIds: [main.lineId],
        ingredientNames: [main.ingredientName],
      });
      continue;
    }
    if (canonicalIngredientId(next.ingredient) !== main.canonicalIngredientId) {
      violations.push({
        code: 'main_canonical_identity_changed',
        lineIds: [main.lineId],
        ingredientNames: [main.ingredientName],
      });
    }
    if (next.lock_type !== 'main') {
      violations.push({
        code: 'main_role_removed',
        lineIds: [main.lineId],
        ingredientNames: [main.ingredientName],
      });
    }
    if (!(next.planned_grams > POSITIVE_GRAMS_EPSILON)) {
      violations.push({
        code: 'main_ingredient_zeroed',
        lineIds: [main.lineId],
        ingredientNames: [main.ingredientName],
      });
    }
    const nextRatioWeight =
      typeof next.main_ratio_weight === 'number' &&
      Number.isFinite(next.main_ratio_weight) &&
      next.main_ratio_weight > 0
        ? next.main_ratio_weight
        : 1;
    const nextRatioExplicit =
      typeof next.main_ratio_weight === 'number' &&
      Number.isFinite(next.main_ratio_weight) &&
      next.main_ratio_weight > 0;
    if (
      nextRatioExplicit !== main.ratioExplicit ||
      Math.abs(nextRatioWeight - main.ratioWeight) > MAIN_RATIO_TOLERANCE
    ) {
      violations.push({
        code: 'main_ratio_metadata_changed',
        lineIds: [main.lineId],
        ingredientNames: [main.ingredientName],
      });
    }
    survivingGrams.push(next.planned_grams);
  }

  if (violations.length === 0 && mains.length > 1) {
    const actualTotal = survivingGrams.reduce((sum, grams) => sum + grams, 0);
    if (!(actualTotal > POSITIVE_GRAMS_EPSILON)) {
      violations.push({
        code: 'main_ratio_changed',
        lineIds: mains.map((main) => main.lineId),
        ingredientNames: mains.map((main) => main.ingredientName),
      });
    } else {
      const expected = resolveMainRatioScale(before, byLineId, actualTotal);
      const expectedByLineId = expected.ok
        ? new Map(expected.allocations.map((allocation) => [allocation.lineId, allocation.grams]))
        : new Map<string, number>();
      // `resolveMainRatioScale` already performs deterministic largest-
      // remainder whole-gram allocation. Apply must reproduce that exact
      // allocation; accepting ±1 g per line would allow a forged 49/51 split.
      const ratioChanged = !expected.ok || mains.some((main, index) =>
        Math.abs((expectedByLineId.get(main.lineId) ?? NaN) - survivingGrams[index]!) >
          MAIN_RATIO_TOLERANCE,
      );
      if (ratioChanged) {
        violations.push({
          code: 'main_ratio_changed',
          lineIds: mains.map((main) => main.lineId),
          ingredientNames: mains.map((main) => main.ingredientName),
        });
      }
    }
  }

  if (violations.length > 0) return { ok: false, mains, violations };
  return {
    ok: true,
    mains,
    scaleFactor: survivingGrams[0]! / mains[0]!.grams,
  };
}

export interface MainConstraintLike {
  mode: 'ai' | 'locked' | 'percent' | 'range';
  grams?: number;
  percent?: number;
  minGrams?: number;
  maxGrams?: number;
}

export type MainRatioScaleResult =
  | {
      ok: true;
      scaleFactor: number;
      mains: MainIngredientIntentLine[];
      allocations: Array<{ lineId: string; grams: number }>;
      allocatedMainTotal: number;
      heldEntirelyByExactConstraints: boolean;
    }
  | {
      ok: false;
      code: 'main_ratio_conflict';
      lineIds: string[];
      ingredientNames: string[];
      messagePl: string;
    };

/**
 * Resolve a deterministic Main-group allocation. New user-created Crown sets
 * persist their entered gram relationship as ratio metadata; legacy drafts
 * without that metadata retain the accepted equal-share fallback. Exact locks
 * win per line without locking the rest of the group; unlocked lines share the
 * remaining mass by their confirmed weights. Stable largest-remainder rounding
 * keeps every executable Main amount whole-gram and the split within 1 g.
 */
export function resolveMainRatioScale(
  input: RecipeInput,
  byLineId: Readonly<Record<string, MainConstraintLike | undefined>>,
  desiredMainTotal: number,
): MainRatioScaleResult {
  const mains = captureMainIngredientIntent(input);
  if (mains.length === 0) {
    return {
      ok: true,
      scaleFactor: 1,
      mains,
      allocations: [],
      allocatedMainTotal: 0,
      heldEntirelyByExactConstraints: false,
    };
  }

  const exact = new Map<string, number>();
  const bounds = new Map<string, { min: number; max: number }>();
  const conflict = (): MainRatioScaleResult => ({
    ok: false,
    code: 'main_ratio_conflict',
    lineIds: mains.map((main) => main.lineId),
    ingredientNames: mains.map((main) => main.ingredientName),
    messagePl:
      `Blokady lub zakresy składników Głównych (${mains.map((main) => main.ingredientName).join(', ')}) ` +
      'są sprzeczne z ich zapisaną proporcją. PI nie zmieniło receptury.',
  });

  for (const main of mains) {
    const constraint = byLineId[main.lineId];
    if (constraint?.mode === 'locked') {
      const grams = constraint.grams;
      if (grams === undefined || !Number.isFinite(grams) || grams < 0) return conflict();
      exact.set(main.lineId, grams);
    } else if (constraint?.mode === 'percent') {
      const percent = constraint.percent;
      if (percent === undefined || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        return conflict();
      }
      exact.set(main.lineId, (input.target_batch_grams * percent) / 100);
    } else if (constraint?.mode === 'range') {
      if (
        constraint.minGrams === undefined ||
        constraint.maxGrams === undefined ||
        !Number.isFinite(constraint.minGrams) ||
        !Number.isFinite(constraint.maxGrams)
      ) {
        return conflict();
      }
      if (constraint.minGrams < 0 || constraint.maxGrams < constraint.minGrams) return conflict();
      bounds.set(main.lineId, { min: constraint.minGrams, max: constraint.maxGrams });
    } else {
      bounds.set(main.lineId, { min: 1, max: Number.POSITIVE_INFINITY });
    }
  }

  const originalTotal = mains.reduce((sum, main) => sum + main.grams, 0);
  const exactTotal = [...exact.values()].reduce((sum, grams) => sum + grams, 0);
  const variable = mains.filter((main) => !exact.has(main.lineId));
  if (variable.length === 0) {
    if (!(exactTotal > POSITIVE_GRAMS_EPSILON)) return conflict();
    return {
      ok: true,
      scaleFactor: originalTotal > 0 ? exactTotal / originalTotal : 1,
      mains,
      allocations: mains.map((main) => ({ lineId: main.lineId, grams: exact.get(main.lineId)! })),
      allocatedMainTotal: exactTotal,
      heldEntirelyByExactConstraints: true,
    };
  }

  const requestedTotal = Math.max(desiredMainTotal, exactTotal);
  const variableTarget = requestedTotal - exactTotal;
  const minimumTotal = variable.reduce((sum, main) => sum + bounds.get(main.lineId)!.min, 0);
  const maximumTotal = variable.reduce((sum, main) => sum + bounds.get(main.lineId)!.max, 0);
  if (variableTarget < minimumTotal - MAIN_RATIO_TOLERANCE) return conflict();
  let boundedTarget = Math.min(variableTarget, maximumTotal);

  const continuous = new Map<string, number>();
  const allExactWhole = [...exact.values()].every((grams) => Math.abs(grams - Math.round(grams)) <= MAIN_RATIO_TOLERANCE);
  const requestedWhole = Math.abs(boundedTarget - Math.round(boundedTarget)) <= MAIN_RATIO_TOLERANCE;
  let wholeRatioAllocation: Map<string, number> | null = null;
  if (allExactWhole && requestedWhole) {
    const weightTotal = variable.reduce((sum, main) => sum + main.ratioWeight, 0);
    const allocate = (target: number): Map<string, number> => {
      const floors = variable.map((main, index) => {
        const exactShare = target * main.ratioWeight / weightTotal;
        return {
          main,
          index,
          grams: Math.floor(exactShare),
          fraction: exactShare - Math.floor(exactShare),
        };
      });
      let remainder = target - floors.reduce((sum, row) => sum + row.grams, 0);
      floors.sort((left, right) => right.fraction - left.fraction || left.index - right.index);
      for (const row of floors) {
        if (remainder <= 0) break;
        row.grams += 1;
        remainder -= 1;
      }
      return new Map(floors.map((row) => [row.main.lineId, row.grams] as const));
    };
    const lowerTarget = Math.ceil(minimumTotal - MAIN_RATIO_TOLERANCE);
    for (let target = Math.floor(boundedTarget + MAIN_RATIO_TOLERANCE); target >= lowerTarget; target -= 1) {
      const allocation = allocate(target);
      const fits = variable.every((main) => {
        const grams = allocation.get(main.lineId)!;
        const bound = bounds.get(main.lineId)!;
        return grams >= bound.min - MAIN_RATIO_TOLERANCE &&
          grams <= bound.max + MAIN_RATIO_TOLERANCE;
      });
      if (fits) {
        boundedTarget = target;
        wholeRatioAllocation = allocation;
        for (const [lineId, grams] of allocation) continuous.set(lineId, grams);
        break;
      }
    }
    if (wholeRatioAllocation === null) return conflict();
  }

  const active = new Set(wholeRatioAllocation === null ? variable.map((main) => main.lineId) : []);
  let remaining = boundedTarget;
  while (active.size > 0) {
    const activeLines = variable.filter((main) => active.has(main.lineId));
    const weightTotal = activeLines.reduce((sum, main) => sum + main.ratioWeight, 0);
    let clamped = false;
    for (const main of activeLines) {
      const bound = bounds.get(main.lineId)!;
      const proposed = remaining * main.ratioWeight / weightTotal;
      if (proposed < bound.min - MAIN_RATIO_TOLERANCE) {
        continuous.set(main.lineId, bound.min);
        remaining -= bound.min;
        active.delete(main.lineId);
        clamped = true;
      } else if (proposed > bound.max + MAIN_RATIO_TOLERANCE) {
        continuous.set(main.lineId, bound.max);
        remaining -= bound.max;
        active.delete(main.lineId);
        clamped = true;
      }
    }
    if (!clamped) {
      for (const main of activeLines) {
        continuous.set(main.lineId, remaining * main.ratioWeight / weightTotal);
      }
      break;
    }
    if (remaining < -MAIN_RATIO_TOLERANCE) return conflict();
  }

  const wholeTarget = Math.abs(boundedTarget - Math.round(boundedTarget)) <= MAIN_RATIO_TOLERANCE;
  if (wholeRatioAllocation === null && allExactWhole && wholeTarget) {
    const floors = variable.map((main) => ({
      main,
      grams: Math.floor(continuous.get(main.lineId) ?? 0),
      fraction: (continuous.get(main.lineId) ?? 0) % 1,
    }));
    let remainder = Math.round(boundedTarget) - floors.reduce((sum, row) => sum + row.grams, 0);
    floors.sort((left, right) => right.fraction - left.fraction ||
      mains.findIndex((main) => main.lineId === left.main.lineId) -
        mains.findIndex((main) => main.lineId === right.main.lineId));
    for (const row of floors) {
      if (remainder <= 0) break;
      const max = bounds.get(row.main.lineId)!.max;
      if (row.grams + 1 <= max + MAIN_RATIO_TOLERANCE) {
        row.grams += 1;
        remainder -= 1;
      }
    }
    if (remainder !== 0) return conflict();
    for (const row of floors) continuous.set(row.main.lineId, row.grams);
  }

  const allocations = mains.map((main) => ({
    lineId: main.lineId,
    grams: exact.get(main.lineId) ?? continuous.get(main.lineId) ?? 0,
  }));
  const allocatedMainTotal = allocations.reduce((sum, allocation) => sum + allocation.grams, 0);
  if (!(allocatedMainTotal > POSITIVE_GRAMS_EPSILON) || !Number.isFinite(allocatedMainTotal)) {
    return conflict();
  }
  return {
    ok: true,
    scaleFactor: originalTotal > 0 ? allocatedMainTotal / originalTotal : 1,
    mains,
    allocations,
    allocatedMainTotal,
    heldEntirelyByExactConstraints: false,
  };
}

export function mainIdentityViolationMessage(
  check: Extract<MainIdentityCheck, { ok: false }>,
): string {
  const names = [...new Set(check.violations.flatMap((violation) => violation.ingredientNames))];
  return (
    `Propozycja narusza tożsamość składników Głównych (${names.join(', ')}): ` +
    'składnik zniknął, został wyzerowany, utracił rolę Główną albo zmieniła się zapisana proporcja. ' +
    'PI nie zmieniło receptury.'
  );
}
