/**
 * USER-INTENT MEASURE (owner USER INTENT / SOFT-HOLD).
 *
 * The engine half of the soft-hold authority: the DRIFT ARITHMETIC and the
 * single material-deviation policy line. It lives here, not in the product
 * layer, for one reason — the engine's own correction solver can reduce a line,
 * so the engine is where the floor has to bind. `isReductionAllowed` has always
 * asked only „is this line held?", never „how much of it did the USER ask
 * for?", which is how a 40 g dried egg yolk became a 1 g trace.
 *
 * This module contains NO science and NO ingredient knowledge: no band, no
 * PAC/POD, no dose, no category, no id. It reads exactly two product-layer
 * sidecars already declared on `RecipeItem` and turns them into a number.
 *
 * ONE SEMANTIC AUTHORITY (owner §10). The product layer's
 * `features/formulation/userLineIntent.ts` re-exports these primitives rather
 * than restating them, and adds what the engine must not know: functional-role
 * flexibility classes, ranking weights and the per-line report.
 */
import type { RecipeItem } from './types';

/**
 * SOFTENING SCALE, as a fraction of the TARGET BATCH.
 *
 * A pure relative measure (|Δ| / baseline) is unstable at tiny amounts: 2 g of
 * tara gum moving to 3 g would read 0.5 — „half the ingredient gone" — and
 * would outrank a 109 g move on the milk. A pure absolute measure (|Δ| grams)
 * is the opposite lie: it cannot tell 40 → 1 from 600 → 561, because both moved
 * 39 g.
 *
 * The fix is a relative measure with an ABSOLUTE floor added to the
 * denominator, taken from the only scale this layer owns — the batch — so it is
 * deterministic, batch-independent in meaning and not a tuned constant.
 */
export const USER_INTENT_DRIFT_SOFTENING_FRACTION = 0.001;

/**
 * THE DRIFT FORMULA (single global policy, owner §9).
 *
 *              | proposed − baseline |
 *   drift =  ─────────────────────────────
 *             baseline + batch × 0.001
 *
 * At the canonical 1000 g batch the softening term is 1 g, so:
 *
 *   yolk    40 g →   1 g   →  39 / 41  = 0.951   catastrophic
 *   yolk    40 g →  35 g   →   5 / 41  = 0.122   ordinary optimization
 *   milk   600 g → 561 g   →  39 / 601 = 0.065   ordinary optimization
 *   tara     2 g →   3 g   →   1 / 3   = 0.333   noticeable, not catastrophic
 *
 * Unbounded above by design: doubling a line is a real deviation and must not
 * saturate at the same number as tripling it.
 */
export function normalizedLineDrift(
  baselineGrams: number,
  proposedGrams: number,
  targetBatchGrams: number,
): number {
  const softening = Math.max(0, targetBatchGrams) * USER_INTENT_DRIFT_SOFTENING_FRACTION;
  const denominator = baselineGrams + softening;
  if (!(denominator > 0)) return 0;
  return Math.abs(proposedGrams - baselineGrams) / denominator;
}

/**
 * MATERIAL DEVIATION THRESHOLD — the single global policy line between
 * „PI rebalanced your recipe" and „PI is proposing to change this ingredient
 * substantially" (owner §7, §12, §13).
 *
 * A line past this is NOT forbidden. It is CONSENT-REQUIRED: the solver must
 * first prove no better-preserving candidate reaches the same result, and the
 * Preview must say so in words instead of presenting it as a small correction.
 *
 * At a 1000 g batch, on a 40 g line, the boundary sits at 40 − 0.5 × 41 =
 * 19.5 g — so 40 → 20 g is ordinary optimization and 40 → 19 g starts asking.
 * ONE documented global number, deliberately not per ingredient or per profile.
 */
export const MATERIAL_USER_INTENT_DRIFT = 0.5;

/**
 * A MATERIAL deviation is a COLLAPSE, not any large move.
 *
 * The owner brief is specific about the destructive direction: „40 g → 1 g is
 * effectively removing the ingredient". Growth is not that — §11 („do not
 * freeze the recipe") is equally binding, and PI must stay free to raise a
 * balancing line hard. Growth still counts fully in `normalizedLineDrift`, so
 * ranking still prefers the candidate closer to what the user asked for; it
 * simply never demands consent.
 */
export const isMaterialUserIntentDeviation = (
  baselineGrams: number,
  proposedGrams: number,
  targetBatchGrams: number,
): boolean =>
  proposedGrams < baselineGrams &&
  normalizedLineDrift(baselineGrams, proposedGrams, targetBatchGrams) > MATERIAL_USER_INTENT_DRIFT;

/**
 * The lowest amount a soft-held line may reach while still being ordinary
 * optimization. Below this the change is a material deviation.
 */
export const materialDeviationFloorGrams = (
  baselineGrams: number,
  targetBatchGrams: number,
): number =>
  baselineGrams -
  MATERIAL_USER_INTENT_DRIFT *
    (baselineGrams + Math.max(0, targetBatchGrams) * USER_INTENT_DRIFT_SOFTENING_FRACTION);

/**
 * The gram amount the USER stands behind for this line, or null when the line
 * carries no user intent (PI put it there).
 *
 * `user_intent_anchor_grams` is written when the user adds an ingredient,
 * demotes a Main back to Standard, or adopts a library recipe;
 * `user_target_grams` is written when the user types an amount. Either is
 * intent; the anchor wins when both are present.
 */
export function userLineBaselineGrams(item: RecipeItem): number | null {
  const anchored = item.user_intent_anchor_grams ?? 0;
  const typed = item.user_target_grams ?? 0;
  const baseline = anchored > 0 ? anchored : typed;
  return baseline > 0 ? baseline : null;
}
