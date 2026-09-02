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
/**
 * The canonical Main group arithmetic, shared by BOTH bands so there is exactly
 * one equivalent-percentage calculation in the codebase:
 *
 *   SENSORY band  — floor + OPTIMAL preference target. Scoped to the CROWN
 *                   (`lock_type === 'main'`), because those are optimisation
 *                   intents, and Crown is what expresses intent.
 *   SAFETY band   — hard limit + approved liquid dairy carrier floor. Scoped to
 *                   MAIN CAPABILITY, because a product that is acting as the
 *                   Main is unsafe past its published limits whether or not the
 *                   customer crowned it.
 *
 * Returns null when the group is empty, a snapshot is missing, or a multi-Main
 * group has no derivable combined envelope.
 */
function mainGroupFacts(
  group: readonly ManagedMain[],
  targetBatchGrams: number,
): {
  equivalentPercent: number;
  floor: number;
  ceiling: number;
  hard: number;
  multiEnvelope: MultiMainEnvelope | null;
  policyId: string | null;
} | null {
  if (group.length === 0) return null;
  const first = group[0]!.snapshot;
  const multi = group.length > 1;
  const multiEnvelope = multi ? resolveMultiMainEnvelope(group) : null;
  if (multi && multiEnvelope === null) return null;
  if (
    !multi &&
    (!validEnvelopeNumber(first.ecoFloorPercent) ||
      !validEnvelopeNumber(first.optimalCeilingPercent) ||
      !validEnvelopeNumber(first.hardLimitPercent))
  ) {
    return null;
  }
  const equivalentGrams = group.reduce(
    (sum, { item, snapshot }) => sum + item.planned_grams * (snapshot.mainEquivalentFactor ?? 0),
    0,
  );
  return {
    equivalentPercent: targetBatchGrams > 0 ? (equivalentGrams / targetBatchGrams) * 100 : 0,
    floor: multi ? multiEnvelope!.floorPercent : first.ecoFloorPercent!,
    ceiling: multi ? multiEnvelope!.optimalCeilingPercent : first.optimalCeilingPercent!,
    hard: multi ? multiEnvelope!.hardLimitPercent : first.hardLimitPercent!,
    multiEnvelope,
    policyId: multi ? multiEnvelope!.policyId : first.mainPolicyId,
  };
}

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
  /** The Main group whose policy imposes the carrier floor. Defaults to the
   * CROWN group. `verifyMainEnvelope` passes the capability-scoped group once
   * the safety band has engaged, so an uncrowned product that is acting as the
   * Main cannot escape its own carrier requirement. */
  mainLineIds?: readonly string[];
}): MainEnvelopeViolation[] {
  const explicitMains = input.mainLineIds === undefined ? null : new Set(input.mainLineIds);
  const managedMains = input.recipe.items.filter(
    (item) =>
      input.snapshots[item.id] !== undefined &&
      (explicitMains === null ? item.lock_type === 'main' : explicitMains.has(item.id)),
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
  // CROWN-OFF SAFETY BAND. Crown expresses OPTIMISATION INTENT; it must not
  // decide whether safety rules exist. A MAIN_CAPABLE product that has reached
  // Main territory — its canonical equivalent share has reached the published
  // `eco_floor_percent` — carries its own hard limit and carrier floor whether
  // or not the customer crowned it. Below that threshold the product is a
  // garnish and the Main policy does not engage.
  const capabilityCandidates: ManagedMain[] = input.recipe.items
    .filter((item) => !technicalOnlyMainLineIds.has(item.id))
    .map((item) => ({ item, snapshot: input.snapshots[item.id] }))
    .filter((entry): entry is ManagedMain => entry.snapshot !== undefined)
    .filter(({ snapshot }) => resolveMainCapability({ snapshot, snapshotRequired: true }).selectable);
  // COMPLETE-OR-NOTHING. A PARTIAL Main group has no derivable envelope: judging
  // one calibrated member against its own single-product limit while an
  // uncalibrated sibling is invisible manufactures a violation that no published
  // policy supports. If any Main-capable line is user-held/uncalibrated, the
  // combined envelope is unknown and today's behaviour (skip) stands — exactly
  // as the Crown path already fails open for `userHeld` under §6/§21.
  const capabilityGroup: ManagedMain[] = capabilityCandidates.every(
    ({ snapshot }) =>
      resolveMainCapability({ snapshot, snapshotRequired: true }).state === 'MAIN_CAPABLE',
  )
    ? capabilityCandidates
    : [];
  const safetyViolations = (): MainEnvelopeViolation[] => {
    const facts = mainGroupFacts(capabilityGroup, input.recipe.target_batch_grams);
    if (facts === null) return [];
    // Engagement threshold: the canonical GROUP equivalent share, so split Main
    // lines cannot each sit under the floor and together exceed it.
    if (facts.equivalentPercent < facts.floor - EPSILON) return [];
    const lineIds = capabilityGroup.map(({ item }) => item.id);
    const found: MainEnvelopeViolation[] = [];
    if (facts.equivalentPercent > facts.hard + EPSILON) {
      found.push({
        code: 'main_above_hard_limit',
        lineIds,
        messagePl: `Grupa Main przekracza twardy limit ${facts.hard.toFixed(1)}%.`,
      });
    }
    found.push(
      ...verifyMainTechnicalCarrier({
        recipe: input.recipe,
        snapshots: input.snapshots,
        mainLineIds: lineIds,
      }),
    );
    return found;
  };

  if (mains.length === 0) {
    const unsafe = safetyViolations();
    return unsafe.length > 0
      ? { ok: false, violations: unsafe }
      : {
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
    const unsafe = safetyViolations();
    return unsafe.length > 0
      ? { ok: false, violations: unsafe }
      : {
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
  // Crown-ON behaviour above is unchanged and stays frozen (GEL-P0-027). The
  // capability-scoped band is ADDITIVE here, and only ever adds a code the
  // Crown group did not already raise: it closes the split-Main bypass, where
  // a crowned Main sits inside its envelope while an UNCROWNED Main-capable
  // line pushes the canonical group past the hard limit or under the carrier
  // floor.
  const alreadyRaised = new Set(violations.map((violation) => violation.code));
  violations.push(
    ...safetyViolations().filter((violation) => !alreadyRaised.has(violation.code)),
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
