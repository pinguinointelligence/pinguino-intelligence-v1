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
 * THE WHOLE public-score cost of using the approved emergency envelope — owner
 * clarification 2026-09-19, and it is ONE point.
 *
 * Controlled relaxation is an IDEALITY signal, never an invalidity signal, and
 * the signal is BINARY on the public scale: the recipe either stayed inside the
 * owner's preferred ranges or it did not. It costs the same one point whether
 * the excursion is barely outside the normal band, midway through the approved
 * emergency range, or at its boundary — and the same one point whether one
 * range was left or several. Using MORE of an envelope the owner explicitly
 * approved is not a second defect, so it is never charged twice and can never
 * turn 10/10 into 8/10.
 *
 * SEVERITY IS NOT LOST, it simply is not on the public integer: `relaxationCost`
 * and each range's `normalizedExcursion` keep it continuously, and those are
 * what rank candidates, break ties, drive diagnostics and would drive any
 * future refinement of the public scale. So 81 g and 120 g are NOT equivalent
 * internally — 120 g carries the higher cost and loses to 81 g whenever target
 * quality is otherwise equal — while both, if they are what safely reaches the
 * requested level, are VALID and cost the same single public point.
 *
 * Other authorities keep their own weight: this is subtracted from whatever the
 * canonical seam already decided, so a genuine quality defect is never masked.
 */
export const RELAXATION_SCORE_PENALTY_CAP = 1;

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
 * Points off the canonical 1–10 fit — exactly one, or none at all.
 *
 *   inside every owner band     → 0
 *   any controlled relaxation   → 1, however far and however many ranges
 */
export function relaxationScorePenalty(input: RecipeInput): number {
  return relaxedOwnerRanges(input).length === 0 ? 0 : RELAXATION_SCORE_PENALTY_CAP;
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
