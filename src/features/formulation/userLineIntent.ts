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
import {
  MATERIAL_USER_INTENT_DRIFT,
  USER_INTENT_DRIFT_SOFTENING_FRACTION,
  isMaterialUserIntentDeviation,
  materialDeviationFloorGrams,
  normalizedLineDrift,
  userLineBaselineGrams as engineUserLineBaselineGrams,
  type RecipeInput,
  type RecipeItem,
} from '@/engine';
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
  return engineUserLineBaselineGrams(item);
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
    const baselineGrams = engineUserLineBaselineGrams(item);
    if (baselineGrams === null) continue;
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
 * ONE SEMANTIC AUTHORITY (owner §10). The drift arithmetic and the material
 * policy line live in the ENGINE (`@/engine` → `engine/userIntent.ts`), because
 * the engine's own correction solver can reduce a line and therefore needs the
 * floor to bind there. They are re-exported here — never restated — so local
 * correction, ECO, full formulation, Rescue and candidate ranking all measure
 * user intent with exactly the same numbers.
 */
export {
  MATERIAL_USER_INTENT_DRIFT,
  USER_INTENT_DRIFT_SOFTENING_FRACTION,
  isMaterialUserIntentDeviation,
  materialDeviationFloorGrams,
  normalizedLineDrift,
};

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
