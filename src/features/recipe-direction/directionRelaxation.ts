/**
 * CONTROLLED ±2 DIRECTION RELAXATION — the shared primitives
 * (owner decision 2026-09-19, „GLOBAL ±2 CONTROLLED RELAXATION").
 *
 * ONE policy, in shared CORE, for every profile, every category, HOME and PRO,
 * domestic and professional machines. There is no profile branch here and no
 * ingredient branch here: this file only knows about LEVELS and BANDS.
 *
 * THE POLICY, stated once:
 *
 *   ±1  — the normal / ideal operating envelope. The solver searches the
 *         owner's standard ranges and never widens them merely to reach.
 *   ±2  — STAGE A is that same normal envelope. Only when Stage A cannot reach
 *         the requested target may STAGE B widen the constraints that are
 *         EXPLICITLY classified relaxable, by 50 % of each boundary's own
 *         value: 20–80 g becomes 10–120 g. One normal range, one controlled
 *         extreme range, never compounded.
 *
 * A result that had to leave the normal range is VALID — it is never rejected
 * for that reason alone — but it is LESS IDEAL, and the excursion is measured
 * here so one canonical score can charge for it proportionally.
 *
 * Hard authorities are not in scope for any of this: safety, physical
 * formulation limits, machine limits, process limits, batch capacity, Main
 * constraints, explicit user locks and exact values are never relaxed. This
 * file widens PREFERENCE BANDS only, and only for ±2.
 */
import type { RecipeInput } from '@/engine';
import { normalizeRecipeDirectionTargets } from './recipeDirectionTargets';

/** The only Direction level that may leave the normal envelope. */
export const DIRECTION_EXTREME_LEVEL = 2;

/** The controlled fallback extends each boundary by 50 % of its OWN value. */
export const EXTENDED_RANGE_LOWER_FACTOR = 0.5;
export const EXTENDED_RANGE_UPPER_FACTOR = 1.5;

/** Excursions smaller than this are rounding, not a relaxation. */
export const RANGE_EXCURSION_EPS = 1e-9;

export interface GramBand {
  readonly minGrams: number;
  readonly maxGrams: number;
}

/**
 * TRUE ⇔ this draft is asking for an EXTREME Direction level, which is the only
 * request that may use the controlled extended envelope. Read from the draft's
 * own canonical targets, so every surface — solver, practicalization, scoring,
 * tests — answers the question identically without extra plumbing.
 */
export function directionRelaxationPermitted(input: RecipeInput): boolean {
  if (input.goals?.direction_targets_active !== true) return false;
  const targets = normalizeRecipeDirectionTargets(input.goals?.direction_targets);
  return Object.values(targets).some(
    (target) => Math.abs(target) >= DIRECTION_EXTREME_LEVEL,
  );
}

/**
 * The one controlled extreme band for a normal band. Derived from the ORIGINAL
 * bounds every time, so it can never compound: applying it twice returns the
 * same interval.
 */
export function extendedGramBand(normal: GramBand): GramBand {
  return {
    minGrams: normal.minGrams * EXTENDED_RANGE_LOWER_FACTOR,
    maxGrams: normal.maxGrams * EXTENDED_RANGE_UPPER_FACTOR,
  };
}

/**
 * The band a draft may actually use: the normal one, or the controlled extreme
 * one when — and only when — an extreme level was requested.
 */
export function permittedGramBand(input: RecipeInput, normal: GramBand): GramBand {
  return directionRelaxationPermitted(input) ? extendedGramBand(normal) : normal;
}

/**
 * NORMALIZED excursion outside a normal band: 0 inside it, 1 at the extreme
 * band's own edge, >1 beyond what the policy permits at all.
 *
 * Normalized — not raw grams — so the same penalty curve is fair to a 20–80 g
 * band and to a 100–200 g one. Saturation is the CALLER's business: a score
 * clamps it, a legality check refuses above 1.
 */
export function normalizedRangeExcursion(grams: number, normal: GramBand): number {
  const extended = extendedGramBand(normal);
  if (grams > normal.maxGrams + RANGE_EXCURSION_EPS) {
    const reach = extended.maxGrams - normal.maxGrams;
    return reach > 0 ? (grams - normal.maxGrams) / reach : Number.POSITIVE_INFINITY;
  }
  if (grams < normal.minGrams - RANGE_EXCURSION_EPS) {
    const reach = normal.minGrams - extended.minGrams;
    return reach > 0 ? (normal.minGrams - grams) / reach : Number.POSITIVE_INFINITY;
  }
  return 0;
}
