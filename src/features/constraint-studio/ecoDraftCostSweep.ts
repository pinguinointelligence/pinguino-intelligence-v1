import {
  calculateRecipe,
  detectViolations,
  type CorrectionConstraints,
  type RecipeInput,
} from '@/engine';
import type { ConstraintSet } from '@/features/recipe-constraints';
import { violatesApprovedStabilizerDosage } from '@/features/formulation/stabilizerDosage';
import { verifyEcoFlavourProtection } from '@/features/formulation-strategy/flavourFloor';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';
import {
  applyEffectiveCustomerPrices,
  type CustomerPriceIndex,
} from '@/features/pro-core/effectiveRecipePricing';
import { recipeFitForInput } from '@/features/protein-gelato/proteinAuthority';
import {
  applyDraftAdjustment,
  buildDraftCandidateVector,
  draftAdjustmentActions,
  type DraftAdjustmentMove,
  type DraftStateMeasure,
  type DraftSweepResult,
} from './draftCandidateVector';

const EPSILON = 1e-9;
const TARGET_CURRENCY = 'EUR';

/**
 * ECO QUALITY FLOOR — owner product decision, Protein closeout.
 *
 * ECO is LOWEST COST WITH QUALITY PROTECTED, never "cheapest at any cost".
 *
 * The sweep's admission test used to be `sameTechnicalFit` alone, which compares
 * only NATIVE band violations. A Protein candidate can sit deep inside every
 * hard band while its structural quality collapses — measured: ECO reached
 * ~17 % protein by mass at Score 4-5 purely because the concentrate was the
 * cheapest way to hold the bands. Nothing in the loop ever looked at the Score.
 *
 * The rule: if a legal candidate at Score >= 8 exists, ECO may not select one
 * below 8 merely because it is cheaper. Trading 10 -> 8 for real savings is
 * allowed; trading 10 -> 5 is not.
 *
 * When the draft already starts below the floor — because nothing better is
 * reachable from here — ECO must simply never make quality worse, so the
 * effective floor drops to whatever the baseline already achieves. That keeps
 * this a protection and never a new hard gate: no recipe becomes invalid, and
 * ECO can still always return its starting point.
 */
export const ECO_QUALITY_FLOOR_SCORE = 8;

/** Complete cost/kg of the already price-resolved transient input. Missing is never zero. */
export function effectiveInputCostPerKg(input: RecipeInput): number | null {
  const grams = input.items.reduce((sum, item) => sum + item.planned_grams, 0);
  if (!(grams > 0)) return null;
  let total = 0;
  for (const item of input.items) {
    const price = item.ingredient.cost_per_kg;
    if (
      price === null ||
      !Number.isFinite(price) ||
      price < 0 ||
      item.ingredient.cost_currency !== TARGET_CURRENCY
    ) {
      return null;
    }
    total += (item.planned_grams / 1000) * price;
  }
  return total / (grams / 1000);
}

function measure(input: RecipeInput, priceOverrides: CustomerPriceIndex): DraftStateMeasure {
  // Customer prices are a transient commercial projection. They may rank ECO
  // candidates, but must never be copied into the canonical RecipeInput that
  // Preview/Apply/Save persists.
  const pricedInput = applyEffectiveCustomerPrices(input, priceOverrides);
  const violations = detectViolations(calculateRecipe(pricedInput));
  return {
    violations: violations.length,
    severityPoints: violations.reduce((sum, violation) => sum + violation.severity_points, 0),
    costPerKg: effectiveInputCostPerKg(pricedInput),
  };
}

/**
 * The public Score of a candidate — exactly the number the user is shown, so the
 * floor protects the thing the owner actually reasons about. Null when the
 * recipe cannot be scored, which never blocks a move.
 */
const qualityScore = (input: RecipeInput, priceOverrides: CustomerPriceIndex): number | null => {
  const pricedInput = applyEffectiveCustomerPrices(input, priceOverrides);
  return recipeFitForInput(pricedInput, calculateRecipe(pricedInput)).score;
};

const sameTechnicalFit = (next: DraftStateMeasure, current: DraftStateMeasure): boolean =>
  next.violations === current.violations &&
  Math.abs(next.severityPoints - current.severityPoints) <= EPSILON;

const cheaper = (next: DraftStateMeasure, current: DraftStateMeasure): boolean =>
  next.costPerKg != null &&
  current.costPerKg != null &&
  next.costPerKg < current.costPerKg - EPSILON;

export interface EcoDraftCostSweepArgs {
  identityInput: RecipeInput;
  start: RecipeInput;
  set: ConstraintSet;
  excludedIngredientIds: ReadonlySet<string>;
  constraints: CorrectionConstraints;
  normalize: (candidate: RecipeInput) => RecipeInput;
  /** Owner-private prices used only to rank this in-memory ECO search. */
  priceOverrides?: CustomerPriceIndex;
  productBehaviorSnapshots?: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}

/**
 * Deterministic bounded coordinate sweep over CURRENT unlocked ingredients.
 * Cost is a tie-break only: each accepted move must preserve the exact native
 * violation count/severity, Main/ratio/flavour floor, locks and batch normalizer.
 */
export function sweepEcoDraftCost(args: EcoDraftCostSweepArgs): DraftSweepResult | null {
  const priceOverrides = args.priceOverrides ?? {};
  const baseline = measure(args.start, priceOverrides);
  if (baseline.costPerKg === null) return null;
  // The floor never rises above what the draft already achieves, so ECO is
  // protected from downgrading quality without ever becoming a new hard gate.
  const baselineQuality = qualityScore(args.start, priceOverrides);
  const effectiveFloor =
    baselineQuality === null ? null : Math.min(ECO_QUALITY_FLOOR_SCORE, baselineQuality);
  let state = args.start;
  let current = baseline;
  const moves: DraftAdjustmentMove[] = [];

  for (const lineId of buildDraftCandidateVector(
    args.start,
    args.set,
    args.excludedIngredientIds,
  ).map((candidate) => candidate.lineId)) {
    const candidate = buildDraftCandidateVector(state, args.set, args.excludedIngredientIds).find(
      (entry) => entry.lineId === lineId,
    );
    if (!candidate) continue;

    let best: { input: RecipeInput; measure: DraftStateMeasure; move: DraftAdjustmentMove } | null =
      null;
    for (const toGrams of candidate.testedGrams) {
      const actions = draftAdjustmentActions(candidate, toGrams);
      if (actions.length === 0 || violatesApprovedStabilizerDosage(state, actions[0]!)) continue;
      const move: DraftAdjustmentMove = {
        lineId: candidate.lineId,
        ingredientId: candidate.ingredientId,
        ingredientName: candidate.ingredientName,
        fromGrams: candidate.currentGrams,
        toGrams,
        direction: toGrams > candidate.currentGrams ? 'increase' : 'decrease',
        actions,
      };
      const applied = applyDraftAdjustment(state, move, args.constraints);
      if (!applied) continue;
      const normalized = args.normalize(applied);
      const next = measure(normalized, priceOverrides);
      if (!sameTechnicalFit(next, current) || !cheaper(next, current)) continue;
      if (!verifyEcoFlavourProtection(args.identityInput, normalized, {
        productBehaviorSnapshots: args.productBehaviorSnapshots,
      }).ok) continue;
      // Quality floor: a cheaper candidate may not drop below it.
      const nextQuality = qualityScore(normalized, priceOverrides);
      if (effectiveFloor !== null && nextQuality !== null && nextQuality < effectiveFloor) continue;
      if (best) {
        const bestQuality = qualityScore(best.input, priceOverrides);
        // Strictly cheaper always wins. At effectively equal cost, prefer the
        // better product rather than whichever move happened to be tried first.
        const strictlyCheaper = cheaper(next, best.measure);
        const equalCost =
          !strictlyCheaper &&
          next.costPerKg != null &&
          best.measure.costPerKg != null &&
          Math.abs(next.costPerKg - best.measure.costPerKg) <= EPSILON;
        const betterAtEqualCost =
          equalCost && nextQuality !== null && bestQuality !== null && nextQuality > bestQuality;
        if (!strictlyCheaper && !betterAtEqualCost) continue;
      }
      best = { input: normalized, measure: next, move };
    }
    if (best) {
      state = best.input;
      current = best.measure;
      moves.push(best.move);
    }
  }

  return moves.length > 0 && cheaper(current, baseline)
    ? { input: state, measure: current, moves }
    : null;
}
