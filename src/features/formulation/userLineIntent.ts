/**
 * USER LINE INTENT — the canonical, profile-independent authority for
 * "the user gave this ingredient a positive gram amount" (owner GLOBAL USER
 * INTENT / SOFT-HOLD SOLVER, 2026-08-23).
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * The solver ranked candidates by the engine measure ALONE (out-of-band count,
 * then severity points). Nothing in that measure knows the difference between
 *
 *     EGGS CHICKEN YOLK DRIED   40 g → 38 g      (ordinary optimization)
 *     EGGS CHICKEN YOLK DRIED   40 g →  1 g      (the ingredient is gone)
 *
 * so whichever reached the band first won. Worse, the two places that KNEW a
 * line carried user intent used that knowledge only to guarantee PRESENCE at
 * >= 1 g: the gram ladder offered an explicit `1 g` rung for exactly the
 * anchored lines (`draftCandidateVector`), and the pipeline clamped a zeroed
 * anchored line up to `Math.max(1, …)`. A 97.5 % reduction was therefore not
 * an accident of search — it was a rung the search was handed, and the
 * presence rule was what CHOSE the number 1.
 *
 * WHAT THIS MODULE IS (and is NOT)
 * --------------------------------
 * It is a MEASURE and a CLASSIFICATION, not a lock and not science. It reads
 * only authority that already exists — `lock_type`, the §17 constraint set,
 * Main, `resolveFunctionalRole`, and the product-layer intent sidecars
 * (`user_intent_anchor_grams` / `user_target_grams`). It contains no band, no
 * target, no PAC/POD, no dose and no ingredient list: there is no
 * `eggYolk = protected` here and there never may be. Every candidate it ranks
 * is still judged for LEGALITY by the engine alone.
 *
 * IT IS NOT A HARD LOCK. §11 of the owner brief is binding: PI must still
 * rebalance a bad recipe. A soft-held line may move — it may move a lot when
 * the recipe needs it — but a MATERIAL collapse must be proven necessary and
 * surfaced as an explicit tradeoff instead of being called a normal correction.
 */
import type { RecipeInput, RecipeItem } from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { resolveFunctionalRole, type FunctionalRole } from './ingredientRoles';

/* ── flexibility classes ─────────────────────────────────────────────────── */

/**
 * How much preservation authority one line carries. Ordered from strongest to
 * weakest. The class is DERIVED from existing authority — never declared per
 * ingredient.
 */
export type UserLineFlexibilityClass =
  /** §17 padlock or engine-native non-unlocked hold: exact, never moves. */
  | 'hard_locked'
  /** Main. Governed by the Main contract, NOT by this module (§20). */
  | 'main_protected'
  /** A user-held line that carries flavour or structural identity. */
  | 'user_flavour_structure'
  /** A user-held line with no more specific authority. */
  | 'user_general'
  /** A user-held line whose job IS to balance (water, base liquid, sugars). */
  | 'user_technical_balancer'
  /** PI put it there. Lowest preservation authority. */
  | 'pi_auto_added';

/**
 * Role → class. Every role of `FunctionalRole` is listed explicitly so a new
 * role cannot silently inherit "balancer" (the most disposable class).
 *
 * The split is the EXISTING product distinction, not a new one: the roles that
 * define what the recipe IS versus the roles that exist to make the numbers
 * land. A gelato without its egg, fruit, nut paste, cocoa or alcohol is a
 * different product; a gelato with 486 g of milk instead of 595 g is the same
 * product, balanced.
 */
const ROLE_FLEXIBILITY: Readonly<Record<FunctionalRole, UserLineFlexibilityClass>> = {
  /* identity: the recipe IS this */
  egg: 'user_flavour_structure',
  fruit: 'user_flavour_structure',
  nut_paste: 'user_flavour_structure',
  chocolate_cocoa: 'user_flavour_structure',
  alcohol: 'user_flavour_structure',
  flavor_other: 'user_flavour_structure',
  dairy_fat: 'user_flavour_structure',
  plant_fat: 'user_flavour_structure',
  protein_source: 'user_flavour_structure',
  /* structural, but not identity */
  milk_solids: 'user_general',
  /* the balancing lines — flexible BY THEIR OWN ROLE, never disposable */
  primary_liquid: 'user_technical_balancer',
  plant_liquid: 'user_technical_balancer',
  water: 'user_technical_balancer',
  sweetener_sucrose: 'user_technical_balancer',
  sugar_freezing_control: 'user_technical_balancer',
  fiber_body: 'user_technical_balancer',
  salt_modifier: 'user_technical_balancer',
  stabilizer: 'user_technical_balancer',
};

/**
 * Preservation WEIGHT per class — the only tuning surface of this module, and
 * deliberately coarse. §10 is binding: every user-specified positive line has
 * NONZERO authority, so no user class may weigh 0.
 */
const CLASS_WEIGHT: Readonly<Record<UserLineFlexibilityClass, number>> = {
  hard_locked: 0, // never moves; its own authority is exact
  main_protected: 0, // §20 — the Main contract owns it, not this module
  user_flavour_structure: 1,
  user_general: 0.7,
  user_technical_balancer: 0.3,
  pi_auto_added: 0,
};

/* ── the intent record ───────────────────────────────────────────────────── */

export interface UserLineIntent {
  lineId: string;
  /** Stable canonical Mapper identity of the line. */
  canonicalIngredientId: string;
  ingredientName: string;
  /** The gram amount the USER stands behind for this solve. */
  baselineGrams: number;
  /** Did the user explicitly add / type / open this line at a positive amount? */
  userSpecified: boolean;
  role: FunctionalRole;
  flexibility: UserLineFlexibilityClass;
  locked: boolean;
  main: boolean;
  /** Ranking weight of this line's drift (0 ⇒ outside this authority). */
  weight: number;
}

const isHardHeld = (item: RecipeItem, set: ConstraintSet): boolean => {
  const constraint = set.byLineId[item.id];
  if (constraint !== undefined && constraint.mode !== 'ai') return true;
  return item.lock_type !== 'unlocked' && item.lock_type !== 'main';
};

/**
 * Does this line carry an explicit positive USER amount?
 *
 * The product layer already records this in two sidecars, written by the store
 * on exactly the three user actions that create intent: adding an ingredient,
 * typing a gram amount, and demoting a Main back to Standard. Reopening a
 * saved recipe re-establishes them from the saved state, so a reopened recipe
 * is user intent too (owner §26).
 */
export const lineCarriesUserIntent = (item: RecipeItem): boolean =>
  item.planned_grams > 0 &&
  ((item.user_intent_anchor_grams ?? 0) > 0 || (item.user_target_grams ?? 0) > 0);

export function classifyUserLineFlexibility(
  item: RecipeItem,
  set: ConstraintSet,
): UserLineFlexibilityClass {
  if (isHardHeld(item, set)) return 'hard_locked';
  if (item.lock_type === 'main') return 'main_protected';
  if (!lineCarriesUserIntent(item)) return 'pi_auto_added';
  return ROLE_FLEXIBILITY[resolveFunctionalRole(item.ingredient)];
}

/**
 * THE BASELINE of one solve: every line the user stands behind, at the amount
 * they stand behind. Deterministic and order-stable (draft order).
 *
 * The baseline is the amount the USER supplied — `user_intent_anchor_grams`
 * when present, otherwise the typed `user_target_grams`. It is deliberately
 * NOT `planned_grams` of an intermediate search state: §9 requires drift to be
 * measured against the user baseline, never candidate-against-candidate.
 */
/**
 * HOT PATH. The user-intent baseline of ONE line, or null when the line carries
 * none. Allocation-free: the gram ladder rebuilds itself for every line of
 * every intermediate state, so building the whole `UserLineIntent` map there
 * would allocate O(lines²) records per sweep.
 */
export function userLineBaselineGrams(item: RecipeItem, set: ConstraintSet): number | null {
  const flexibility = classifyUserLineFlexibility(item, set);
  if (CLASS_WEIGHT[flexibility] <= 0) return null;
  const anchored = item.user_intent_anchor_grams ?? 0;
  const typed = item.user_target_grams ?? 0;
  const baselineGrams = anchored > 0 ? anchored : typed;
  return baselineGrams > 0 ? baselineGrams : null;
}

export function buildUserIntentBaseline(
  input: RecipeInput,
  set: ConstraintSet,
): Map<string, UserLineIntent> {
  const baseline = new Map<string, UserLineIntent>();
  for (const item of input.items) {
    const flexibility = classifyUserLineFlexibility(item, set);
    const weight = CLASS_WEIGHT[flexibility];
    if (weight <= 0) continue;
    const anchored = item.user_intent_anchor_grams ?? 0;
    const typed = item.user_target_grams ?? 0;
    const baselineGrams = anchored > 0 ? anchored : typed;
    if (!(baselineGrams > 0)) continue;
    baseline.set(item.id, {
      lineId: item.id,
      canonicalIngredientId: item.ingredient.canonical_ingredient_id ?? item.ingredient.id,
      ingredientName: item.ingredient.name,
      baselineGrams,
      userSpecified: true,
      role: resolveFunctionalRole(item.ingredient),
      flexibility,
      locked: false,
      main: false,
      weight,
    });
  }
  return baseline;
}

/* ── the drift measure (owner §9) ────────────────────────────────────────── */

/**
 * SOFTENING SCALE, as a fraction of the TARGET BATCH.
 *
 * A pure relative measure (|Δ| / baseline) is unstable at tiny amounts: a
 * 2 g tara gum moving to 3 g would read 0.5 — "half the ingredient gone" — and
 * would outrank a 109 g move on the milk. A pure absolute measure (|Δ| grams)
 * is the opposite lie: it cannot tell 40 → 1 from 600 → 561, because both
 * moved 39 g, and §9 forbids exactly that.
 *
 * The fix is a relative measure with an ABSOLUTE floor added to the
 * denominator, and the floor is taken from the only scale this layer owns —
 * the batch — so it is deterministic, batch-independent in meaning and not a
 * tuned constant. It is the same 0.1 % rung the gram ladder already uses as
 * its smallest step: below one ladder rung, a move is not a deviation at all.
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
 * — which is exactly the ordering §9 demands: the same 39 g move reads 0.951
 * on the yolk and 0.065 on the milk, and the tiny stabilizer line cannot
 * dominate the sum merely for being small.
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
 * "PI rebalanced your recipe" and "PI is proposing to change this ingredient
 * substantially" (owner §7, §12, §13).
 *
 * A line whose normalized drift exceeds this is NOT forbidden. It is
 * CONSENT-REQUIRED: the solver must first prove no better-preserving candidate
 * reaches the same result, and the Preview must say what it is doing in words
 * instead of presenting it as an ordinary small correction.
 *
 * At a 1000 g batch, on a 40 g line, the material boundary sits at
 * 40 − 0.5 × 41 = 19.5 g — so 40 → 20 g is ordinary optimization and
 * 40 → 19 g starts asking. This is ONE documented global number, deliberately
 * not per ingredient and not per profile.
 */
export const MATERIAL_USER_INTENT_DRIFT = 0.5;

/**
 * A MATERIAL deviation is a COLLAPSE, not any large move.
 *
 * The owner brief is specific about which direction destroys intent: „40 g →
 * 1 g is effectively removing the ingredient". Growth is not that — §11 is
 * equally binding („do not freeze the recipe"), and PI must stay free to raise
 * a balancing line hard when the recipe needs it. Treating a rise as
 * consent-required was measured to push ordinary rebalances (inulin 20 → 70 g,
 * cream 120 → 220 g) into the proof-and-disclose path, which both narrows the
 * search and floods the Preview with warnings about PI doing its job.
 *
 * Growth still counts fully in `normalizedLineDrift`, so among candidates the
 * engine scores the same the solver still prefers the one closer to the amount
 * the user asked for — it simply does not demand consent for it.
 */
export const isMaterialUserIntentDeviation = (
  baselineGrams: number,
  proposedGrams: number,
  targetBatchGrams: number,
): boolean =>
  proposedGrams < baselineGrams &&
  normalizedLineDrift(baselineGrams, proposedGrams, targetBatchGrams) > MATERIAL_USER_INTENT_DRIFT;

/**
 * The largest amount a soft-held line may reach WITHOUT becoming a material
 * deviation, in the reducing direction. Used by the gram ladder to place a
 * rung exactly at the boundary instead of at the presence floor of 1 g.
 */
export const materialDeviationFloorGrams = (
  baselineGrams: number,
  targetBatchGrams: number,
): number =>
  baselineGrams -
  MATERIAL_USER_INTENT_DRIFT *
    (baselineGrams + Math.max(0, targetBatchGrams) * USER_INTENT_DRIFT_SOFTENING_FRACTION);

/* ── whole-candidate drift (the ranking key) ─────────────────────────────── */

export interface UserIntentDeviation {
  lineId: string;
  canonicalIngredientId: string;
  ingredientName: string;
  baselineGrams: number;
  proposedGrams: number;
  absoluteDriftGrams: number;
  relativeDrift: number;
  flexibility: UserLineFlexibilityClass;
  material: boolean;
}

export interface UserIntentDriftReport {
  /** Σ weight × drift over every soft-held line. Lower is better. */
  total: number;
  /** Every soft-held line, in draft order. */
  lines: UserIntentDeviation[];
  /** The subset that crossed the material policy line. */
  material: UserIntentDeviation[];
}

/**
 * Measure one candidate against the USER BASELINE (never against another
 * candidate). A line that the candidate DROPPED entirely counts as a move to
 * 0 g — removal is the most destructive deviation there is, never a free one.
 */
export function measureUserIntentDrift(
  baseline: ReadonlyMap<string, UserLineIntent>,
  candidate: RecipeInput,
): UserIntentDriftReport {
  const batch = candidate.target_batch_grams;
  const byLineId = new Map(candidate.items.map((item) => [item.id, item]));
  const lines: UserIntentDeviation[] = [];
  let total = 0;
  for (const intent of baseline.values()) {
    const proposedGrams = byLineId.get(intent.lineId)?.planned_grams ?? 0;
    const relativeDrift = normalizedLineDrift(intent.baselineGrams, proposedGrams, batch);
    total += intent.weight * relativeDrift;
    lines.push({
      lineId: intent.lineId,
      canonicalIngredientId: intent.canonicalIngredientId,
      ingredientName: intent.ingredientName,
      baselineGrams: intent.baselineGrams,
      proposedGrams,
      absoluteDriftGrams: proposedGrams - intent.baselineGrams,
      relativeDrift,
      flexibility: intent.flexibility,
      material: isMaterialUserIntentDeviation(intent.baselineGrams, proposedGrams, batch),
    });
  }
  return { total, lines, material: lines.filter((line) => line.material) };
}

/**
 * HOT PATH. Σ weight × drift, WITHOUT building the per-line report. The solver
 * calls this once per evaluated candidate — tens of thousands of times in a
 * single Direction solve — so it must not allocate. `measureUserIntentDrift`
 * stays the reporting form and is called once per Preview.
 */
export function userIntentDriftTotal(
  baseline: ReadonlyMap<string, UserLineIntent>,
  candidate: RecipeInput,
): number {
  if (baseline.size === 0) return 0;
  const batch = candidate.target_batch_grams;
  const softening = Math.max(0, batch) * USER_INTENT_DRIFT_SOFTENING_FRACTION;
  let total = 0;
  for (const intent of baseline.values()) {
    let proposedGrams = 0;
    for (const item of candidate.items) {
      if (item.id === intent.lineId) {
        proposedGrams = item.planned_grams;
        break;
      }
    }
    const denominator = intent.baselineGrams + softening;
    if (denominator > 0) {
      total += (intent.weight * Math.abs(proposedGrams - intent.baselineGrams)) / denominator;
    }
  }
  return total;
}

/** Deterministic comparison epsilon for the drift ranking key. */
export const USER_INTENT_DRIFT_EPS = 1e-9;
