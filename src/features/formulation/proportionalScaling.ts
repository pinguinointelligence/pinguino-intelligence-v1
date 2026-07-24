/**
 * PROPORTIONAL-SCALING DETECTOR (owner addendum, Agent 3 — PERMANENT runtime +
 * regression check). PURE, deterministic, no engine math, no science.
 *
 * Contract: compute per-unlocked-line `scaleFactor_i = output_i / baseline_i`
 * against the formulation SEED baseline (pre-normalization role targets). When
 * MOST unlocked lines share ONE factor within tolerance, the presented state is
 * a proportional PROJECTION of the seed — arithmetic normalization, not
 * formulation. Such a state may NEVER be presented as an engine-formulated
 * result: either real engine-verified improving moves ran (composition is then
 * materially different from any shared-factor projection), or the outcome must
 * be the honest `no_feasible_improvement` proof / `impossible_under_constraints`
 * state (see applyPipeline `FormulationProof`).
 *
 * Detection rules (deterministic, no invented science — pure arithmetic):
 *  - only UNLOCKED lines participate (user-held locked/range/grams lines are
 *    byte-preserved by design and prove nothing);
 *  - a solver-ADDED line absent from the baseline is real evidence of a
 *    non-proportional change — it counts as an eligible NON-matching line;
 *  - the shared factor is the largest cluster of per-line factors within
 *    RELATIVE tolerance `PROPORTIONAL_FACTOR_REL_TOL`;
 *  - `proportional` = the cluster covers ≥ `PROPORTIONAL_SHARE_THRESHOLD` of
 *    eligible lines (and at least one factor exists).
 */
import type { RecipeInput } from '@/engine';

export interface ProportionalScalingReport {
  /** TRUE — the output is (near-)uniform scaling of the baseline: a projection. */
  proportional: boolean;
  /** The shared factor when proportional (cluster anchor), else null. */
  sharedFactor: number | null;
  /** Lines matching the dominant factor cluster. */
  matchedLines: number;
  /** Unlocked lines eligible for the check (incl. solver-added evidence lines). */
  eligibleLines: number;
}

/** Relative tolerance for two per-line factors to count as "the same factor". */
export const PROPORTIONAL_FACTOR_REL_TOL = 1e-3;

/** Minimum share of eligible unlocked lines on one factor ⇒ projection. */
export const PROPORTIONAL_SHARE_THRESHOLD = 0.75;

/**
 * Detect whether `output`'s unlocked lines are one shared factor × the seed
 * baseline. `heldLineIds` = lines held by a §17 constraint (locked/range) or an
 * engine lock — excluded from the check.
 */
export function detectProportionalScaling(
  baselineGramsByLineId: Readonly<Record<string, number>>,
  output: RecipeInput,
  heldLineIds: ReadonlySet<string>,
): ProportionalScalingReport {
  const factors: number[] = [];
  let eligible = 0;
  for (const item of output.items) {
    if (heldLineIds.has(item.id)) continue;
    if (item.lock_type !== 'unlocked') continue;
    const baseline = baselineGramsByLineId[item.id];
    if (baseline === undefined) {
      // Solver-added line: real evidence AGAINST a pure projection.
      eligible += 1;
      continue;
    }
    if (!(baseline > 0)) continue; // zero-baseline factor is undefined
    eligible += 1;
    factors.push(item.planned_grams / baseline);
  }

  if (eligible === 0 || factors.length === 0) {
    return { proportional: false, sharedFactor: null, matchedLines: 0, eligibleLines: eligible };
  }

  // Largest cluster by anchor scan (deterministic: first best anchor wins).
  let bestCount = 0;
  let bestFactor = 0;
  for (const anchor of factors) {
    const tolerance = Math.max(Math.abs(anchor), 1e-12) * PROPORTIONAL_FACTOR_REL_TOL;
    let count = 0;
    for (const factor of factors) {
      if (Math.abs(factor - anchor) <= tolerance) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      bestFactor = anchor;
    }
  }

  const proportional = bestCount / eligible >= PROPORTIONAL_SHARE_THRESHOLD;
  return {
    proportional,
    sharedFactor: proportional ? bestFactor : null,
    matchedLines: bestCount,
    eligibleLines: eligible,
  };
}
