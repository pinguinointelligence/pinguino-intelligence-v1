import type { RecipeInput } from '@/engine';
import type { ProductBehaviorSnapshot } from './contracts';
import { mainBehaviorBlockReason, productBehaviorRequiredLineIds } from './productBehaviorAccess';
import { resolveMainCapability, userHeldMainLineIds } from './mainCapability';

const EPSILON = 1e-7;

type ManagedMain = {
  item: RecipeInput['items'][number];
  snapshot: ProductBehaviorSnapshot;
};

type MultiMainEnvelope = {
  floorPercent: number;
  optimalCeilingPercent: number;
  hardLimitPercent: number;
  policyId: string | null;
  totalRatioWeight: number;
  totalWeightedEquivalentFactor: number;
};

const mainRatioWeight = (item: ManagedMain['item']): number =>
  typeof item.main_ratio_weight === 'number' &&
  Number.isFinite(item.main_ratio_weight) &&
  item.main_ratio_weight > 0
    ? item.main_ratio_weight
    : 1;

const validEnvelopeNumber = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Resolve Multi-Main authority without manufacturing a product-pair policy.
 *
 * A published shared combination cap remains authoritative when every member
 * carries that exact group/version/cap. Otherwise the feasible group range is
 * the conservative algebraic intersection of the already-published individual
 * hard envelopes:
 *
 *   derivedCombinedHardLimit = min(individualHardLimit_i)
 *
 * Since every positive member's equivalent contribution is at most the group
 * total, this guarantees that no member can exceed its own hard limit at any
 * ratio. The stored ratio and factors then convert that shared equivalent cap
 * into raw grams for search. This is O(N), creates no new scientific constant
 * and still fails closed when bases or family compatibility cannot be proven.
 */
function resolveMultiMainEnvelope(resolved: readonly ManagedMain[]): MultiMainEnvelope | null {
  if (resolved.length < 2) return null;

  const first = resolved[0]!.snapshot;
  if (
    first.mainBasis === null ||
    resolved.some(
      ({ snapshot }) =>
        snapshot.mainBasis !== first.mainBasis ||
        !validEnvelopeNumber(snapshot.ecoFloorPercent) ||
        !validEnvelopeNumber(snapshot.optimalCeilingPercent) ||
        !validEnvelopeNumber(snapshot.hardLimitPercent) ||
        !validEnvelopeNumber(snapshot.mainEquivalentFactor) ||
        snapshot.mainEquivalentFactor <= 0 ||
        snapshot.optimalCeilingPercent! > snapshot.hardLimitPercent! + EPSILON,
    )
  ) {
    return null;
  }

  const families = [
    ...new Set(resolved.map(({ snapshot }) => snapshot.familyId).filter(Boolean)),
  ] as string[];
  const hasCompleteFamilyAuthority = resolved.every(({ snapshot }) => snapshot.familyId !== null);
  const mixedFamiliesApproved =
    families.length <= 1 ||
    families.every((family) =>
      resolved.every(
        ({ snapshot }) =>
          snapshot.familyId === family || snapshot.approvedMixedFamilyIds.includes(family),
      ),
    );

  const sharedPublishedPolicy =
    first.mainPolicyId !== null &&
    first.mainPolicyVersion !== null &&
    validEnvelopeNumber(first.multiMainHardLimitPercent) &&
    resolved.every(
      ({ snapshot }) =>
        snapshot.mainPolicyId === first.mainPolicyId &&
        snapshot.mainPolicyVersion === first.mainPolicyVersion &&
        snapshot.mainBasis === first.mainBasis &&
        snapshot.multiMainHardLimitPercent === first.multiMainHardLimitPercent,
    );

  // An exact published group is already the compatibility authority. Generic
  // fallback additionally requires complete same/mutually-approved family data.
  if (!mixedFamiliesApproved || (!sharedPublishedPolicy && !hasCompleteFamilyAuthority)) {
    return null;
  }

  const weighted = resolved.map(({ item, snapshot }) => ({
    ratioWeight: mainRatioWeight(item),
    weightedEquivalentFactor: mainRatioWeight(item) * snapshot.mainEquivalentFactor!,
    snapshot,
  }));
  const totalRatioWeight = weighted.reduce((sum, value) => sum + value.ratioWeight, 0);
  const totalWeightedEquivalentFactor = weighted.reduce(
    (sum, value) => sum + value.weightedEquivalentFactor,
    0,
  );
  if (!(totalRatioWeight > 0) || !(totalWeightedEquivalentFactor > 0)) return null;

  const floorPercent = Math.max(...resolved.map(({ snapshot }) => snapshot.ecoFloorPercent!));
  if (sharedPublishedPolicy) {
    return {
      floorPercent,
      optimalCeilingPercent: first.multiMainHardLimitPercent!,
      hardLimitPercent: first.multiMainHardLimitPercent!,
      policyId: first.mainPolicyId,
      totalRatioWeight,
      totalWeightedEquivalentFactor,
    };
  }

  const derivedCombinedHardLimit = Math.min(
    ...resolved.map(({ snapshot }) => snapshot.hardLimitPercent!),
  );

  return {
    floorPercent,
    // The schema publishes no separate Multi-Main OPTIMAL ceiling. Existing
    // shared policies use their aggregate hard cap for both modes; the generic
    // fallback follows that same conservative contract.
    optimalCeilingPercent: derivedCombinedHardLimit,
    hardLimitPercent: derivedCombinedHardLimit,
    policyId: null,
    totalRatioWeight,
    totalWeightedEquivalentFactor,
  };
}

export type MainEnvelopeViolationCode =
  | 'product_behavior_missing'
  | 'product_behavior_identity_mismatch'
  | 'product_dosage_violation'
  | 'main_behavior_missing'
  | 'main_behavior_blocked'
  | 'main_policy_inconsistent'
  | 'main_below_floor'
  | 'main_above_optimal_ceiling'
  | 'main_above_hard_limit'
  | 'multi_main_policy_unknown'
  | 'liquid_dairy_carrier_below_floor';

export interface MainEnvelopeViolation {
  code: MainEnvelopeViolationCode;
  lineIds: string[];
  messagePl: string;
}

export type MainEnvelopeVerification =
  | {
      ok: true;
      equivalentPercent: number | null;
      targetPercent: number | null;
      hardLimitPercent: number | null;
      policyId: string | null;
    }
  | { ok: false; violations: MainEnvelopeViolation[] };

const baseSnapshots = (
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): ProductBehaviorSnapshot[] =>
  Object.values(snapshots).filter(
    (snapshot): snapshot is ProductBehaviorSnapshot =>
      snapshot !== undefined && snapshot.processScope === 'BASE_FORMULATION',
  );

/** Technical product constraint shared by the LP, candidate generator and
 * final Preview/Apply gates. It deliberately ignores sensory Main policy
 * readiness: only the approved liquid-dairy carrier minimum is checked. */
export function verifyMainTechnicalCarrier(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
}): MainEnvelopeViolation[] {
  const managedMains = input.recipe.items.filter(
    (item) => item.lock_type === 'main' && input.snapshots[item.id] !== undefined,
  );
  const dairyPolicies = managedMains
    .map((item) => input.snapshots[item.id]!)
    .filter(
      (snapshot) =>
        snapshot.requiresLiquidDairyCarrier && snapshot.liquidDairyCarrierFloorPercent !== null,
    );
  const dairyFloor =
    dairyPolicies.length > 0
      ? Math.max(...dairyPolicies.map((snapshot) => snapshot.liquidDairyCarrierFloorPercent!))
      : null;
  if (dairyFloor === null) return [];

  const carrierIds = new Set(
    baseSnapshots(input.snapshots)
      .filter((snapshot) => snapshot.approvedLiquidDairyCarrier)
      .map((snapshot) => snapshot.lineId),
  );
  const carrierGrams = input.recipe.items.reduce(
    (sum, item) => sum + (carrierIds.has(item.id) ? item.planned_grams : 0),
    0,
  );
  const carrierPercent =
    input.recipe.target_batch_grams > 0
      ? (carrierGrams / input.recipe.target_batch_grams) * 100
      : 0;
  return carrierPercent < dairyFloor - EPSILON
    ? [
        {
          code: 'liquid_dairy_carrier_below_floor',
          lineIds: managedMains.map((item) => item.id),
          messagePl:
            `Zatwierdzony płynny nośnik mleczny ma ${carrierPercent.toFixed(1)}%; ` +
            `wymagane minimum to ${dairyFloor.toFixed(1)}%.`,
        },
      ]
    : [];
}

/** Product-layer Main contract. It consumes immutable resolver snapshots only;
 * it never derives families/forms/policies from ingredient names and never
 * changes Engine science. Product-lineage and accepted built-in Main rows fail
 * closed if authority is absent; only synthetic non-canonical fixtures remain
 * outside this boundary. */
export function verifyMainEnvelope(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  mode: 'optimal' | 'eco';
  enforceFloor?: boolean;
  /** Opt-in for the OPTIMAL preference ceiling. Default `false`: an active
   * Crown overrides the preference target and is bounded by the hard limit. */
  enforceOptimalPreferenceCeiling?: boolean;
  /** Owner Review keeps these rows visibly locked as Main, but they remain
   * technical-only seeds until an exact sensory Main policy is approved. */
  technicalOnlyMainLineIds?: readonly string[];
}): MainEnvelopeVerification {
  const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
  // GLOBAL MAIN AUTHORITY §6/§21: a Main group holding at least one product
  // without an approved envelope has no combined sensory range to verify. The
  // Main identity contract protects membership and ratio, while absolute grams
  // remain movable through the unchanged Engine and hard safety gates.
  const userHeld = new Set(
    userHeldMainLineIds({
      items: input.recipe.items,
      snapshots: input.snapshots,
      excludeLineIds: [...technicalOnlyMainLineIds],
    }),
  );
  const mains = input.recipe.items.filter(
    (item) =>
      item.lock_type === 'main' && !technicalOnlyMainLineIds.has(item.id) && !userHeld.has(item.id),
  );
  if (mains.length === 0) {
    return {
      ok: true,
      equivalentPercent: null,
      targetPercent: null,
      hardLimitPercent: null,
      policyId: null,
    };
  }
  const managed = mains.filter((item) => input.snapshots[item.id] !== undefined);
  const requiredLineIds = new Set(productBehaviorRequiredLineIds({ items: input.recipe.items }));
  const missingRequired = mains.filter(
    (item) => input.snapshots[item.id] === undefined && requiredLineIds.has(item.id),
  );
  if (missingRequired.length > 0) {
    return {
      ok: false,
      violations: [
        {
          code: 'main_behavior_missing',
          lineIds: missingRequired.map((item) => item.id),
          messagePl: 'Składnik Główny wymaga ponownej walidacji technicznej produktu.',
        },
      ],
    };
  }
  if (managed.length === 0) {
    return {
      ok: true,
      equivalentPercent: null,
      targetPercent: null,
      hardLimitPercent: null,
      policyId: null,
    };
  }
  const violations: MainEnvelopeViolation[] = [];
  if (managed.length !== mains.length) {
    violations.push({
      code: 'main_behavior_missing',
      lineIds: mains
        .filter((item) => input.snapshots[item.id] === undefined)
        .map((item) => item.id),
      messagePl: 'Nie wszystkie składniki Główne mają aktualny snapshot techniczny produktu.',
    });
  }
  const resolved: ManagedMain[] = managed.map((item) => ({
    item,
    snapshot: input.snapshots[item.id]!,
  }));
  for (const { item, snapshot } of resolved) {
    const reason = mainBehaviorBlockReason(snapshot);
    if (reason) {
      violations.push({ code: 'main_behavior_blocked', lineIds: [item.id], messagePl: reason });
    }
  }
  if (violations.length > 0) return { ok: false, violations };

  const first = resolved[0]!.snapshot;
  const multi = resolved.length > 1;
  const multiEnvelope = multi ? resolveMultiMainEnvelope(resolved) : null;
  if (multi && multiEnvelope === null) {
    return {
      ok: false,
      violations: [
        {
          code: 'multi_main_policy_unknown',
          lineIds: managed.map((item) => item.id),
          messagePl:
            'Nie można bezpiecznie wyznaczyć wspólnego zakresu Main z dostępnych podstaw i rodzin produktów.',
        },
      ],
    };
  }

  const equivalentGrams = resolved.reduce(
    (sum, { item, snapshot }) => sum + item.planned_grams * (snapshot.mainEquivalentFactor ?? 0),
    0,
  );
  const equivalentPercent =
    input.recipe.target_batch_grams > 0
      ? (equivalentGrams / input.recipe.target_batch_grams) * 100
      : 0;
  const floor = multi ? multiEnvelope!.floorPercent : first.ecoFloorPercent!;
  const ceiling = multi ? multiEnvelope!.optimalCeilingPercent : first.optimalCeilingPercent!;
  const hard = multi ? multiEnvelope!.hardLimitPercent : first.hardLimitPercent!;
  if (input.enforceFloor !== false && equivalentPercent < floor - EPSILON) {
    violations.push({
      code: 'main_below_floor',
      lineIds: managed.map((item) => item.id),
      messagePl:
        `Grupa Main ma ${equivalentPercent.toFixed(1)}%; ` +
        `wymagane minimum to ${floor.toFixed(1)}%.`,
    });
  }
  // OWNER CROWN AUTHORITY: reaching this point means a managed Crown line is
  // active, and Crown is an explicit request to maximise. `optimalCeiling` is
  // the OPTIMAL *target* (see `targetPercent` below), not a safety boundary, so
  // crossing it must never invalidate the candidate. The hard limit below stays
  // enforced in every mode. Callers that genuinely want the preference boundary
  // (non-Crown formulation) must opt in explicitly.
  if (
    input.enforceOptimalPreferenceCeiling === true &&
    input.mode === 'optimal' &&
    equivalentPercent > ceiling + EPSILON
  ) {
    violations.push({
      code: 'main_above_optimal_ceiling',
      lineIds: managed.map((item) => item.id),
      messagePl: `Grupa Main przekracza zatwierdzony poziom OPTIMAL ${ceiling.toFixed(1)}%.`,
    });
  }
  if (equivalentPercent > hard + EPSILON) {
    violations.push({
      code: 'main_above_hard_limit',
      lineIds: managed.map((item) => item.id),
      messagePl: `Grupa Main przekracza twardy limit ${hard.toFixed(1)}%.`,
    });
  }
  violations.push(
    ...verifyMainTechnicalCarrier({ recipe: input.recipe, snapshots: input.snapshots }),
  );

  return violations.length > 0
    ? { ok: false, violations }
    : {
        ok: true,
        equivalentPercent,
        targetPercent: input.mode === 'optimal' ? ceiling : floor,
        hardLimitPercent: hard,
        policyId: multi ? multiEnvelope!.policyId : first.mainPolicyId,
      };
}

export function mainEnvelopeSearchCeilingGrams(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  technicalOnlyMainLineIds?: readonly string[];
}): number | null {
  const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
  const mains = input.recipe.items.filter(
    (item) => item.lock_type === 'main' && !technicalOnlyMainLineIds.has(item.id),
  );
  if (mains.length === 0 || mains.some((item) => !input.snapshots[item.id])) return null;
  // No invented percentage ceiling for user-held Main (§4).
  if (
    mains.some((item) => resolveMainCapability({ snapshot: input.snapshots[item.id] }).userHeld)
  ) {
    return null;
  }
  const snapshots = mains.map((item) => input.snapshots[item.id]!);
  const first = snapshots[0]!;
  const multi = snapshots.length > 1;
  if (!multi) {
    // OWNER CROWN AUTHORITY: an active Crown is an explicit MAX request, so the
    // search frontier is the published HARD SAFETY limit in every mode.
    // `optimalCeilingPercent` is a preference target (see `verifyMainEnvelope`),
    // never a safety boundary, so it must not cap an explicit maximisation.
    const ceilingPercent = first.hardLimitPercent;
    if (ceilingPercent === null || first.mainEquivalentFactor === null) return null;
    return (input.recipe.target_batch_grams * ceilingPercent) / 100 / first.mainEquivalentFactor;
  }

  const envelope = resolveMultiMainEnvelope(
    mains.map((item) => ({ item, snapshot: input.snapshots[item.id]! })),
  );
  if (envelope === null) return null;
  const ceilingPercent = envelope.hardLimitPercent;
  return (
    (((input.recipe.target_batch_grams * ceilingPercent) / 100) * envelope.totalRatioWeight) /
    envelope.totalWeightedEquivalentFactor
  );
}

/**
 * Project the published Main sensory floor onto the current user ratio.
 *
 * This is the lower-bound counterpart to `mainEnvelopeSearchCeilingGrams`.
 * It supplies no acceptance authority: candidates at or above this projection
 * still pass `verifyMainEnvelope`, practicalization and the deterministic
 * Engine. It only prevents a frontier search from enumerating group totals
 * that the same immutable ProductBehavior envelope already proves impossible.
 */
export function mainEnvelopeSearchFloorGrams(input: {
  recipe: RecipeInput;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  technicalOnlyMainLineIds?: readonly string[];
}): number | null {
  const technicalOnlyMainLineIds = new Set(input.technicalOnlyMainLineIds ?? []);
  const mains = input.recipe.items.filter(
    (item) => item.lock_type === 'main' && !technicalOnlyMainLineIds.has(item.id),
  );
  if (mains.length === 0 || mains.some((item) => !input.snapshots[item.id])) return null;
  // No invented percentage floor for user-held Main (§4).
  if (
    mains.some((item) => resolveMainCapability({ snapshot: input.snapshots[item.id] }).userHeld)
  ) {
    return null;
  }
  const snapshots = mains.map((item) => input.snapshots[item.id]!);
  const first = snapshots[0]!;
  if (snapshots.length === 1) {
    if (first.ecoFloorPercent === null || first.mainEquivalentFactor === null) return null;
    return (
      (input.recipe.target_batch_grams * first.ecoFloorPercent) / 100 / first.mainEquivalentFactor
    );
  }

  const envelope = resolveMultiMainEnvelope(
    mains.map((item) => ({ item, snapshot: input.snapshots[item.id]! })),
  );
  if (envelope === null) return null;
  return (
    (((input.recipe.target_batch_grams * envelope.floorPercent) / 100) *
      envelope.totalRatioWeight) /
    envelope.totalWeightedEquivalentFactor
  );
}
