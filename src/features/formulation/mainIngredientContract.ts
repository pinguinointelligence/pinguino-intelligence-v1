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
}

export interface MainIdentityViolation {
  code:
    | 'main_line_missing'
    | 'main_canonical_identity_changed'
    | 'main_role_removed'
    | 'main_ingredient_zeroed'
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
    survivingGrams.push(next.planned_grams);
  }

  if (violations.length === 0 && mains.length > 1) {
    const expectedTotal = mains.reduce((sum, main) => sum + main.grams, 0);
    const actualTotal = survivingGrams.reduce((sum, grams) => sum + grams, 0);
    if (!(actualTotal > POSITIVE_GRAMS_EPSILON)) {
      violations.push({
        code: 'main_ratio_changed',
        lineIds: mains.map((main) => main.lineId),
        ingredientNames: mains.map((main) => main.ingredientName),
      });
    } else {
      const ratioChanged = mains.some((main, index) => {
        const expectedShare = main.grams / expectedTotal;
        const actualShare = survivingGrams[index]! / actualTotal;
        return Math.abs(expectedShare - actualShare) > MAIN_RATIO_TOLERANCE;
      });
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
  mode: 'ai' | 'locked' | 'range';
  grams?: number;
  minGrams?: number;
  maxGrams?: number;
}

export type MainRatioScaleResult =
  | { ok: true; scaleFactor: number; mains: MainIngredientIntentLine[] }
  | {
      ok: false;
      code: 'main_ratio_conflict';
      lineIds: string[];
      ingredientNames: string[];
      messagePl: string;
    };

/**
 * Resolve one shared scale factor for every positive Main line. An exact lock
 * anchors the whole group; ranges intersect as factor bounds. If those explicit
 * instructions disagree, the only honest outcome is a conflict.
 */
export function resolveMainRatioScale(
  input: RecipeInput,
  byLineId: Readonly<Record<string, MainConstraintLike | undefined>>,
  desiredMainTotal: number,
): MainRatioScaleResult {
  const mains = captureMainIngredientIntent(input);
  if (mains.length === 0) return { ok: true, scaleFactor: 1, mains };

  let minScale = 0;
  let maxScale = Number.POSITIVE_INFINITY;
  let exactScale: number | null = null;
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
      const factor = grams / main.grams;
      if (exactScale !== null && Math.abs(factor - exactScale) > MAIN_RATIO_TOLERANCE) {
        return conflict();
      }
      exactScale = factor;
    } else if (constraint?.mode === 'range') {
      if (
        constraint.minGrams === undefined ||
        constraint.maxGrams === undefined ||
        !Number.isFinite(constraint.minGrams) ||
        !Number.isFinite(constraint.maxGrams)
      ) {
        return conflict();
      }
      minScale = Math.max(minScale, constraint.minGrams / main.grams);
      maxScale = Math.min(maxScale, constraint.maxGrams / main.grams);
    }
  }

  if (minScale > maxScale + MAIN_RATIO_TOLERANCE) return conflict();
  if (
    exactScale !== null &&
    (exactScale < minScale - MAIN_RATIO_TOLERANCE || exactScale > maxScale + MAIN_RATIO_TOLERANCE)
  ) {
    return conflict();
  }

  const originalTotal = mains.reduce((sum, main) => sum + main.grams, 0);
  const desiredScale = desiredMainTotal > POSITIVE_GRAMS_EPSILON ? desiredMainTotal / originalTotal : 1;
  const scaleFactor = exactScale ?? Math.min(Math.max(desiredScale, minScale), maxScale);
  if (!(scaleFactor > POSITIVE_GRAMS_EPSILON) || !Number.isFinite(scaleFactor)) return conflict();
  return { ok: true, scaleFactor, mains };
}

export function mainIdentityViolationMessage(check: Extract<MainIdentityCheck, { ok: false }>): string {
  const names = [...new Set(check.violations.flatMap((violation) => violation.ingredientNames))];
  return (
    `Propozycja narusza tożsamość składników Głównych (${names.join(', ')}): ` +
    'składnik zniknął, został wyzerowany, utracił rolę Główną albo zmieniła się zapisana proporcja. ' +
    'PI nie zmieniło receptury.'
  );
}
