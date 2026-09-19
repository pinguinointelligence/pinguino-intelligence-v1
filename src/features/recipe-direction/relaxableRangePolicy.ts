/**
 * THE RELAXABLE-RANGE REGISTRY — which owner bands the controlled ±2 fallback
 * is allowed to widen, and what leaving one costs
 * (owner decision 2026-09-19, „GLOBAL ±2 CONTROLLED RELAXATION" §6, §10, §11).
 *
 * TWO RULES THIS FILE EXISTS TO KEEP APART.
 *
 * 1. `mode: 'range'` means „this line may MOVE inside this interval". It never
 *    means „freeze this line". That semantics is generic and lives wherever
 *    ranges are read — see `draftCandidateVector.ts`.
 *
 * 2. Not every numeric constraint is RELAXABLE. A range earns that only by
 *    being registered here, because each constraint keeps its own semantic
 *    authority: a published owner DOSAGE PREFERENCE may be stretched under a
 *    ±2 request, a structural calibration ceiling, a safety clamp, a machine
 *    limit or a user's own range may not. Registration is therefore explicit
 *    and per POLICY — never per ingredient name, never per profile, never per
 *    machine.
 *
 * Today exactly one policy is registered: the published Gellatti inulin dosage
 * preference (2–8 % of the batch). The vegan inulin STRUCTURE ceiling is
 * deliberately NOT registered — it is a calibration limit, not a preference.
 * Adding the next relaxable owner band is one entry in `RELAXABLE_POLICIES`,
 * and every profile, category and machine inherits it at once.
 */
import type { RecipeInput } from '@/engine';
import type { ConstraintSet, IngredientConstraint } from '@/features/recipe-constraints';
import {
  OWNER_INULIN_POLICY,
  ownerInulinGramBand,
  ownerInulinPolicyLineIds,
} from '@/features/product-intelligence/ownerInulinPolicy';
import {
  directionRelaxationPermitted,
  extendedGramBand,
  normalizedRangeExcursion,
  RANGE_EXCURSION_EPS,
  type GramBand,
} from './directionRelaxation';

/**
 * THE MOST the canonical 1–10 fit may lose because a recipe used the approved
 * emergency envelope — owner clarification 2026-09-19.
 *
 * Controlled relaxation is an IDEALITY signal, never an invalidity signal. A
 * valid emergency-range solution must not be made to look defective: one
 * quality point is the normal cost of leaving the preferred range, and two is
 * the absolute ceiling, reached only when the excursion is essentially at the
 * emergency edge or when more than one relaxable range was left. The same
 * relaxation is never charged twice.
 *
 * The public score is an INTEGER by its own contract, so it cannot show the
 * difference between an 81 g and a 90 g excursion. That proportionality is not
 * lost: it lives in `relaxationCost` and in each range's `normalizedExcursion`,
 * which rank candidates, drive diagnostics and are what a future refinement of
 * the public scale would read.
 */
export const RELAXATION_SCORE_PENALTY_CAP = 2;

/** At or beyond this share of the permitted excursion the penalty reaches the cap. */
export const RELAXATION_SEVERE_COST = 0.9;

/** Two bands are „the same band" when they agree to this many grams. */
const BAND_IDENTITY_EPS = 1e-6;

interface RelaxablePolicy {
  readonly policyId: string;
  readonly provenance: string;
  /** The lines this policy governs on this draft, in recipe order. */
  readonly lineIds: (input: RecipeInput) => readonly string[];
  /** The NORMAL band the owner published, per line, for this draft. */
  readonly normalBand: (input: RecipeInput) => GramBand;
}

const RELAXABLE_POLICIES: readonly RelaxablePolicy[] = Object.freeze([
  {
    policyId: OWNER_INULIN_POLICY.policyId,
    provenance: OWNER_INULIN_POLICY.provenance,
    lineIds: ownerInulinPolicyLineIds,
    normalBand: (input) => {
      const band = ownerInulinGramBand(input.target_batch_grams);
      return { minGrams: band.minGrams, maxGrams: band.maxGrams };
    },
  },
]);

export interface RelaxableOwnerRange {
  readonly policyId: string;
  readonly provenance: string;
  readonly lineIds: readonly string[];
  /** The aggregate the policy judges — the owner bands a DOSE, not a row. */
  readonly grams: number;
  readonly normal: GramBand;
  readonly extended: GramBand;
  /** 0 inside the normal band, 1 at the extended edge, >1 beyond the policy. */
  readonly normalizedExcursion: number;
}

/**
 * Every registered owner band on this draft that is currently CARRYING a dose.
 * A policy with presence semantics („absent and 0 g are the same thing") is
 * silent at 0 g, so an absent lever is never an excursion.
 */
export function relaxableOwnerRanges(input: RecipeInput): RelaxableOwnerRange[] {
  const ranges: RelaxableOwnerRange[] = [];
  for (const policy of RELAXABLE_POLICIES) {
    const lineIds = policy.lineIds(input);
    if (lineIds.length === 0) continue;
    const governed = new Set(lineIds);
    const grams = input.items
      .filter((item) => governed.has(item.id))
      .reduce((sum, item) => sum + item.planned_grams, 0);
    if (!(grams > 0)) continue;
    const normal = policy.normalBand(input);
    ranges.push({
      policyId: policy.policyId,
      provenance: policy.provenance,
      lineIds: [...lineIds],
      grams,
      normal,
      extended: extendedGramBand(normal),
      normalizedExcursion: normalizedRangeExcursion(grams, normal),
    });
  }
  return ranges;
}

/** The registered lines, for a caller that needs to widen or bound a search. */
export function relaxableRangeLineIds(input: RecipeInput): Set<string> {
  return new Set(RELAXABLE_POLICIES.flatMap((policy) => [...policy.lineIds(input)]));
}

/** The owner bands this draft actually left — the ones a score must charge for. */
export function relaxedOwnerRanges(input: RecipeInput): RelaxableOwnerRange[] {
  return relaxableOwnerRanges(input).filter(
    (range) => range.normalizedExcursion > RANGE_EXCURSION_EPS,
  );
}

/**
 * ONE canonical relaxation cost in [0, 1]. Each excursion is capped at its own
 * permitted maximum first, then combined multiplicatively: every further
 * relaxation takes a share of what IDEALITY is left, so the cost rises with
 * each one, is never double counted, and can never run away.
 */
export function relaxationCost(input: RecipeInput): number {
  let ideal = 1;
  for (const range of relaxedOwnerRanges(input)) {
    ideal *= 1 - Math.min(1, range.normalizedExcursion);
  }
  return 1 - ideal;
}

/**
 * Points off the canonical 1–10 fit — CONSERVATIVE and BOUNDED.
 *
 *   inside every owner band            → 0   (nothing that does not relax moves)
 *   controlled relaxation used         → 1
 *   at the emergency edge, or more
 *   than one range left behind         → 2   (the cap, never more)
 *
 * This never rejects and never reaches far enough to make a valid emergency
 * solution look poor. Other reasons the canonical authority already had to
 * reduce a score are untouched: this is subtracted from whatever that authority
 * decided, so a genuine quality defect keeps its own weight.
 */
export function relaxationScorePenalty(input: RecipeInput): number {
  const relaxed = relaxedOwnerRanges(input);
  if (relaxed.length === 0) return 0;
  const cost = relaxationCost(input);
  const severe = relaxed.length > 1 || cost >= RELAXATION_SEVERE_COST;
  return severe ? RELAXATION_SCORE_PENALTY_CAP : 1;
}

const sameBand = (constraint: IngredientConstraint, band: GramBand): boolean =>
  constraint.mode === 'range' &&
  Math.abs(constraint.minGrams - band.minGrams) <= BAND_IDENTITY_EPS &&
  Math.abs(constraint.maxGrams - band.maxGrams) <= BAND_IDENTITY_EPS;

/**
 * STAGE B's envelope: the same constraint set with every REGISTERED owner band
 * widened to its controlled extreme band.
 *
 * It widens a line only when that line is still carrying the policy's own band
 * byte-for-byte, which is how the policy hold writes it. A customer who set
 * their own range on the same line is carrying a DIFFERENT interval and keeps
 * it untouched — a user constraint is authority, not preference.
 *
 * Every other constraint in the set — locks, percents, structural ceilings,
 * machine and safety limits — is returned exactly as it came in.
 */
export function withExtendedRelaxableRanges(
  input: RecipeInput,
  set: ConstraintSet,
): ConstraintSet {
  const byLineId: Record<string, IngredientConstraint> = { ...set.byLineId };
  let widened = false;
  for (const policy of RELAXABLE_POLICIES) {
    const normal = policy.normalBand(input);
    const extended = extendedGramBand(normal);
    for (const lineId of policy.lineIds(input)) {
      const existing = byLineId[lineId];
      if (existing === undefined || !sameBand(existing, normal)) continue;
      byLineId[lineId] = {
        mode: 'range',
        minGrams: extended.minGrams,
        maxGrams: extended.maxGrams,
      };
      widened = true;
    }
  }
  return widened ? { byLineId } : set;
}

/**
 * The band a draft may legally occupy for one registered policy: the normal one
 * unless an EXTREME level was requested. This is what turns „outside the owner
 * range" from a refusal into a priced, valid excursion — for ±2 only.
 */
export function permittedPolicyBand(input: RecipeInput, normal: GramBand): GramBand {
  return directionRelaxationPermitted(input) ? extendedGramBand(normal) : normal;
}
