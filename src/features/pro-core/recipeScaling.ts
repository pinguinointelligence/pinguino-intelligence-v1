/**
 * PINGÜINO PRO CORE — exact recipe scaling (PURE, deterministic, no IO/SDK).
 *
 * One canonical scaling path: take an IMMUTABLE recipe version + a requested target and scale
 * every ingredient proportionally from the exact underlying quantities. Calculation precision is
 * kept separate from display precision, and BOTH the canonical grams and the rounded/exported
 * grams total the requested batch EXACTLY — via deterministic largest-remainder allocation in
 * integer units, so there is no cumulative rounding drift.
 *
 * It never optimizes, never substitutes ingredients, never invents quantities, and never mutates
 * the source version. Ingredient identity, profile, temperature, the source trace and the Engine
 * / CONFIG versions are preserved verbatim. Weight → volume / portions conversion is refused with
 * an honest `needs_more_information` result unless the caller supplies the density or yield.
 */
import type { RecipeInput } from '@/engine';
import type { RecipeVersion } from './recipeContracts';

/** How much of the recipe to make. Weight is always exact; volume/portions need a conversion. */
export type ScaleTarget =
  | { kind: 'weight_g'; grams: number }
  | { kind: 'volume_ml'; ml: number; densityGPerMl?: number | null }
  | { kind: 'portions'; count: number; portionWeightG?: number | null };

export interface ScaledIngredient {
  id: string;
  name: string;
  /** The version's original planned grams for this line. */
  sourceGrams: number;
  /** Canonical scaled grams (calculation precision — milligram grid by default). */
  grams: number;
  /** Rounded scaled grams for display / export (coarser grid; still totals exactly). */
  displayGrams: number;
}

export interface ExactScaleResult {
  ok: true;
  recipeId: string;
  recipeVersionId: string;
  recipeVersionNumber: number;
  sourceTotalG: number;
  /** The requested batch grams the caller asked for (after any density/yield conversion). */
  requestedBatchG: number;
  /** Σ of the canonical `grams` — equal to `requestedBatchG` on the canonical grid. */
  canonicalTotalG: number;
  /** Σ of the `displayGrams` — equal to `requestedBatchG` on the display grid. */
  displayTotalG: number;
  factor: number;
  canonicalDecimals: number;
  displayDecimals: number;
  lines: ScaledIngredient[];
  /** Preserved verbatim from the source version. */
  productProfile: string | null;
  temperatureC: number | null;
  engineVersion: string;
  configVersion: string;
  mapperDatasetVersion: string | null;
}

export type ScaleResult =
  | ExactScaleResult
  | { ok: false; reason: 'needs_more_information'; missing: string[]; message: string }
  | { ok: false; reason: 'invalid'; message: string };

export interface ScaleOptions {
  /** Canonical (calculation) precision — default 3 decimals (milligrams). */
  canonicalDecimals?: number;
  /** Display / export precision — default 1 decimal (0.1 g). */
  displayDecimals?: number;
}

/**
 * Distribute `targetUnits` (an integer) across `sources` proportionally, returning integer unit
 * counts whose sum is EXACTLY `targetUnits`. Deterministic largest-remainder (Hamilton) method:
 * floor each proportional share, then hand the leftover units to the largest fractional
 * remainders, breaking ties by the lowest index. Pure; the input array is never mutated.
 */
export function allocateUnits(sources: readonly number[], targetUnits: number): number[] {
  const n = sources.length;
  if (n === 0) return [];
  const sourceTotal = sources.reduce((sum, g) => sum + g, 0);
  if (sourceTotal <= 0) return sources.map(() => 0);

  const raw = sources.map((g) => (g / sourceTotal) * targetUnits);
  const result = raw.map((r) => Math.floor(r));
  const assigned = result.reduce((sum, f) => sum + f, 0);
  const remaining = targetUnits - assigned;

  const byRemainderDesc = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .map((x) => x.i);

  if (remaining > 0) {
    for (let k = 0; k < remaining && k < byRemainderDesc.length; k += 1) {
      const idx = byRemainderDesc[k]!;
      result[idx] = (result[idx] ?? 0) + 1;
    }
  } else if (remaining < 0) {
    // Defensive: a rare floating over-allocation. Take units back from the smallest remainders.
    const bySmallest = [...byRemainderDesc].reverse();
    for (let k = 0, take = -remaining; take > 0 && k < bySmallest.length; k += 1) {
      const idx = bySmallest[k]!;
      if ((result[idx] ?? 0) > 0) {
        result[idx] = (result[idx] ?? 0) - 1;
        take -= 1;
      }
    }
  }
  return result;
}

/** grams → integer units on a 10^decimals grid (nearest). */
function toUnits(grams: number, decimals: number): number {
  return Math.round(grams * 10 ** decimals);
}

/** Resolve the requested target into exact grams, or an honest refusal when info is missing. */
function resolveTargetGrams(
  target: ScaleTarget,
): { grams: number } | { missing: string[] } | { invalid: string } {
  switch (target.kind) {
    case 'weight_g':
      return { grams: target.grams };
    case 'volume_ml': {
      const density = target.densityGPerMl;
      if (density == null || !(density > 0)) {
        return { missing: ['density_g_per_ml'] };
      }
      return { grams: target.ml * density };
    }
    case 'portions': {
      const portion = target.portionWeightG;
      if (portion == null || !(portion > 0)) {
        return { missing: ['portion_weight_g'] };
      }
      return { grams: target.count * portion };
    }
  }
}

/**
 * Scale an immutable recipe version to a requested target. Returns an exact result, an honest
 * `needs_more_information` refusal (volume/portions without density/yield), or an `invalid`
 * refusal (non-positive target or a zero-mass source recipe).
 */
export function scaleRecipeVersion(
  version: RecipeVersion,
  target: ScaleTarget,
  options: ScaleOptions = {},
): ScaleResult {
  const canonicalDecimals = options.canonicalDecimals ?? 3;
  const displayDecimals = options.displayDecimals ?? 1;

  const resolved = resolveTargetGrams(target);
  if ('missing' in resolved) {
    return {
      ok: false,
      reason: 'needs_more_information',
      missing: resolved.missing,
      message:
        target.kind === 'volume_ml'
          ? 'Scaling to a volume needs an explicit density (g/ml). No density was supplied, so no volume was assumed.'
          : 'Scaling to portions needs an explicit portion weight (g) or yield. None was supplied, so no yield was assumed.',
    };
  }
  if ('invalid' in resolved) {
    return { ok: false, reason: 'invalid', message: resolved.invalid };
  }

  const requestedBatchG = resolved.grams;
  if (!(requestedBatchG > 0)) {
    return { ok: false, reason: 'invalid', message: 'Target batch weight must be greater than zero.' };
  }

  const items = version.recipeInput.items;
  const sources = items.map((it) => it.planned_grams);
  const sourceTotalG = sources.reduce((sum, g) => sum + g, 0);
  if (!(sourceTotalG > 0)) {
    return { ok: false, reason: 'invalid', message: 'Cannot scale a recipe with zero total mass.' };
  }

  const canonicalUnits = allocateUnits(sources, toUnits(requestedBatchG, canonicalDecimals));
  const displayUnits = allocateUnits(sources, toUnits(requestedBatchG, displayDecimals));

  const lines: ScaledIngredient[] = items.map((it, i) => ({
    id: it.id,
    name: it.ingredient.name,
    sourceGrams: it.planned_grams,
    grams: canonicalUnits[i]! / 10 ** canonicalDecimals,
    displayGrams: displayUnits[i]! / 10 ** displayDecimals,
  }));

  return {
    ok: true,
    recipeId: version.recipeId,
    recipeVersionId: version.versionId,
    recipeVersionNumber: version.versionNumber,
    sourceTotalG,
    requestedBatchG,
    canonicalTotalG: canonicalUnits.reduce((sum, u) => sum + u, 0) / 10 ** canonicalDecimals,
    displayTotalG: displayUnits.reduce((sum, u) => sum + u, 0) / 10 ** displayDecimals,
    factor: requestedBatchG / sourceTotalG,
    canonicalDecimals,
    displayDecimals,
    lines,
    productProfile: version.productProfile,
    temperatureC: version.temperatureC,
    engineVersion: version.engineVersion,
    configVersion: version.configVersion,
    mapperDatasetVersion: version.mapperDatasetVersion,
  };
}

/**
 * Build a scaled engine `RecipeInput` from a version + an exact scale result (deep clone of the
 * version input with each line's `planned_grams` set to the canonical scaled grams and the batch
 * total updated). Used to prove Engine composition invariance and to freeze the production plan.
 * The source version is never mutated.
 */
export function scaledRecipeInput(version: RecipeVersion, scaled: ExactScaleResult): RecipeInput {
  const clone = JSON.parse(JSON.stringify(version.recipeInput)) as RecipeInput;
  const gramsById = new Map(scaled.lines.map((l) => [l.id, l.grams]));
  for (const item of clone.items) {
    const g = gramsById.get(item.id);
    if (g !== undefined) {
      item.planned_grams = g;
      item.actual_grams = null;
    }
  }
  clone.target_batch_grams = scaled.canonicalTotalG;
  return clone;
}
