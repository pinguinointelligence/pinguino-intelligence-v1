/**
 * GLOBAL MAIN AUTHORITY (owner v1.4 §26).
 *
 * One canonical answer to "may this product be the Main ingredient?", derived
 * from product semantics (Mapper / Product Intelligence classification), never
 * from an exact ingredient-id or SKU whitelist.
 *
 * The two questions the old architecture conflated are separated here:
 *
 *   1. Can this product define recipe identity/flavour?  -> capability state
 *   2. Do we own an approved Main envelope for it?       -> calibration level
 *
 * A semantically legitimate flavour carrier with no approved envelope is
 * `MAIN_CAPABLE_UNCALIBRATED`: the user may still declare it Main, PINGÜINO
 * holds their grams and ratio exactly and optimises the supporting ingredients
 * around them. No percentage floor/ceiling is ever invented (§4, §6).
 *
 * Every consumer (UI toggle, store, Engine gates, Rescue, Scanner, INTIMPORT)
 * must call this module. It reads immutable resolver snapshots only.
 */
import type { ProductBehaviorRole, ProductBehaviorSnapshot } from './contracts';

export type MainCapabilityState =
  /** Flavour carrier with an approved, product- or family-level Main envelope. */
  | 'MAIN_CAPABLE'
  /** Flavour carrier with no approved envelope — user-held Main is available. */
  | 'MAIN_CAPABLE_UNCALIBRATED'
  /** Technical/structural/post-process product that cannot define flavour. */
  | 'MAIN_TECHNICAL_BLOCKED'
  /** The system genuinely cannot determine what this product is. */
  | 'MAIN_UNKNOWN';

/** Which authority supplies the Main envelope, when one exists at all. */
export type MainCalibrationLevel = 'EXACT_PRODUCT' | 'FAMILY' | 'NONE';

export type MainCapabilityReasonCode =
  | 'calibrated_main_policy'
  | 'user_held_no_calibration'
  | 'structural_product'
  | 'topping_product'
  | 'protein_contributor'
  | 'standard_base_product'
  | 'post_process_scope'
  | 'base_recipe_not_approved'
  | 'snapshot_missing'
  | 'revalidation_required'
  | 'unknown_product';

export interface MainCapability {
  state: MainCapabilityState;
  reasonCode: MainCapabilityReasonCode;
  /** Owner-facing Polish reason. Null when the product may be selected. */
  reasonPl: string | null;
  familyId: string | null;
  subfamilyId: string | null;
  formId: string | null;
  calibrationLevel: MainCalibrationLevel;
  policyId: string | null;
  policyVersion: string | null;
  /** The user's grams/ratio are held exactly; no envelope is applied. */
  userHeld: boolean;
  /** May the owner set this line as Main right now? */
  selectable: boolean;
}

/** §23: never show a vague tooltip when the real reason is known. */
const REASON_PL: Record<MainCapabilityReasonCode, string | null> = {
  calibrated_main_policy: null,
  user_held_no_calibration: null,
  structural_product: 'Składnik techniczny — nie definiuje smaku receptury.',
  topping_product: 'Produkt po produkcji (topping) nie może być składnikiem głównym.',
  protein_contributor: 'Składnik białkowy nie jest automatycznie smakiem Main.',
  standard_base_product: 'Składnik bazowy/standardowy — nie definiuje smaku receptury.',
  post_process_scope: 'Topping nie może pełnić roli Main.',
  base_recipe_not_approved: 'Produkt nie jest zatwierdzony do receptury bazowej.',
  snapshot_missing: 'Produkt wymaga ponownej walidacji przed ustawieniem jako Main.',
  revalidation_required:
    'Historyczny produkt wymaga utworzenia nowej, zweryfikowanej wersji przed ustawieniem jako Main.',
  unknown_product: 'Gellatti nie rozpoznaje jeszcze tego produktu — brakuje danych o jego roli.',
};

/**
 * Semantic roles that carry recipe flavour identity. These come from the
 * server classifier's product semantics (category/subcategory/family), never
 * from an ingredient-id list. `UNKNOWN_REQUIRES_EVIDENCE` is emitted only
 * inside the classifier's flavour-candidate branch: the product IS a flavour
 * carrier, only its governed form/concentration is still unproven — which is a
 * calibration gap, not a capability gap (§4).
 */
const FLAVOUR_CARRIER_ROLES: ReadonlySet<ProductBehaviorRole | 'MAIN_CAPABLE_UNCALIBRATED'> =
  new Set([
    'MAIN_ALLOWED',
    'MAIN_PROFILE_SPECIFIC',
    'MAIN_CAPABLE_UNCALIBRATED',
    'UNKNOWN_REQUIRES_EVIDENCE',
  ]);

const TECHNICAL_ROLE_REASON: Partial<Record<string, MainCapabilityReasonCode>> = {
  STRUCTURAL_ONLY: 'structural_product',
  NOT_MAIN: 'structural_product',
  TOPPING_ONLY: 'topping_product',
  PROTEIN_CONTRIBUTOR_ONLY: 'protein_contributor',
  STANDARD_ONLY: 'standard_base_product',
};

function capability(
  state: MainCapabilityState,
  reasonCode: MainCapabilityReasonCode,
  snapshot: ProductBehaviorSnapshot | null | undefined,
  calibrationLevel: MainCalibrationLevel = 'NONE',
): MainCapability {
  return {
    state,
    reasonCode,
    reasonPl: REASON_PL[reasonCode],
    familyId: snapshot?.familyId ?? null,
    subfamilyId: snapshot?.subfamilyId ?? null,
    formId: snapshot?.formId ?? null,
    calibrationLevel,
    policyId: calibrationLevel === 'NONE' ? null : (snapshot?.mainPolicyId ?? null),
    policyVersion: calibrationLevel === 'NONE' ? null : (snapshot?.mainPolicyVersion ?? null),
    userHeld: state === 'MAIN_CAPABLE_UNCALIBRATED',
    selectable: state === 'MAIN_CAPABLE' || state === 'MAIN_CAPABLE_UNCALIBRATED',
  };
}

/** A complete, approved envelope for the resolved profile. */
export function hasCalibratedMainEnvelope(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): boolean {
  return Boolean(
    snapshot &&
    snapshot.mainPolicyId &&
    snapshot.mainPolicyVersion &&
    snapshot.ecoFloorPercent !== null &&
    snapshot.optimalCeilingPercent !== null &&
    snapshot.hardLimitPercent !== null &&
    snapshot.mainEquivalentFactor !== null,
  );
}

/**
 * §8 calibration hierarchy: an envelope bound to this exact product identity
 * outranks a family/form policy. Both remain calibrated authority; only their
 * provenance differs.
 */
function calibrationLevelOf(snapshot: ProductBehaviorSnapshot): MainCalibrationLevel {
  if (
    snapshot.mainCalibrationLevel === 'EXACT_PRODUCT' ||
    snapshot.mainCalibrationLevel === 'FAMILY'
  ) {
    return snapshot.mainCalibrationLevel;
  }
  return 'FAMILY';
}

/**
 * THE canonical Main-capability API (§26). Consumers must not re-derive Main
 * eligibility from names, categories, ingredient ids or policy fields.
 */
export function resolveMainCapability(input: {
  snapshot: ProductBehaviorSnapshot | null | undefined;
  /** Product lineage requires a resolver snapshot; a missing one fails closed. */
  snapshotRequired?: boolean;
}): MainCapability {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return input.snapshotRequired
      ? capability('MAIN_UNKNOWN', 'snapshot_missing', null)
      : capability('MAIN_CAPABLE_UNCALIBRATED', 'user_held_no_calibration', null);
  }
  if (snapshot.resolutionState !== 'RESOLVED') {
    return capability('MAIN_UNKNOWN', 'revalidation_required', snapshot);
  }
  if (snapshot.processScope !== 'BASE_FORMULATION') {
    return capability('MAIN_TECHNICAL_BLOCKED', 'post_process_scope', snapshot);
  }
  if (snapshot.moduleEligibility.BASE_RECIPE === 'blocked') {
    return capability('MAIN_TECHNICAL_BLOCKED', 'base_recipe_not_approved', snapshot);
  }

  // Forward snapshots carry the server's semantic answer directly.
  const serverState = snapshot.mainCapability;
  if (serverState === 'MAIN_TECHNICAL_BLOCKED') {
    const reason =
      TECHNICAL_ROLE_REASON[snapshot.behaviorRole ?? ''] ??
      TECHNICAL_ROLE_REASON[snapshot.mainClassification] ??
      'structural_product';
    return capability('MAIN_TECHNICAL_BLOCKED', reason, snapshot);
  }
  if (serverState === 'MAIN_UNKNOWN') {
    return capability('MAIN_UNKNOWN', 'unknown_product', snapshot);
  }
  if (serverState === 'MAIN_CAPABLE' || serverState === 'MAIN_CAPABLE_UNCALIBRATED') {
    return hasCalibratedMainEnvelope(snapshot)
      ? capability('MAIN_CAPABLE', 'calibrated_main_policy', snapshot, calibrationLevelOf(snapshot))
      : capability('MAIN_CAPABLE_UNCALIBRATED', 'user_held_no_calibration', snapshot);
  }

  // Legacy snapshot (schema v1 without the capability layer). Reconstruct the
  // same answer from the semantics it does carry, so saved versions reopen with
  // the identical user intent instead of silently changing role authority.
  const role = snapshot.behaviorRole ?? snapshot.mainClassification;
  const technicalReason = TECHNICAL_ROLE_REASON[role];
  if (technicalReason) return capability('MAIN_TECHNICAL_BLOCKED', technicalReason, snapshot);
  if (FLAVOUR_CARRIER_ROLES.has(role as ProductBehaviorRole)) {
    return hasCalibratedMainEnvelope(snapshot)
      ? capability('MAIN_CAPABLE', 'calibrated_main_policy', snapshot, calibrationLevelOf(snapshot))
      : capability('MAIN_CAPABLE_UNCALIBRATED', 'user_held_no_calibration', snapshot);
  }
  if (role === 'MAIN_BLOCKED_POLICY') {
    // The historical "no approved range" state. It is a calibration gap, so the
    // capability answer is user-held, not blocked (§4, §5).
    return capability('MAIN_CAPABLE_UNCALIBRATED', 'user_held_no_calibration', snapshot);
  }
  return capability('MAIN_UNKNOWN', 'unknown_product', snapshot);
}

/** True when sensory-envelope authority remains with the owner. This protects
 * Main selection and group ratio; it does not create an exact gram lock. */
export function isUserHeldMainSnapshot(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): boolean {
  return resolveMainCapability({ snapshot }).userHeld;
}

/**
 * Line ids whose Main sensory envelope is user-held. §21: a group that mixes
 * calibrated and uncalibrated Mains has no combined approved envelope, so the
 * entire group avoids borrowing one member's science. The group may still move
 * together through the unchanged Engine safety frontier.
 */
export function userHeldMainLineIds(input: {
  items: ReadonlyArray<{ id: string; lock_type?: string | null }>;
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>;
  excludeLineIds?: readonly string[];
}): string[] {
  const excluded = new Set(input.excludeLineIds ?? []);
  const mains = input.items.filter((item) => item.lock_type === 'main' && !excluded.has(item.id));
  if (mains.length === 0) return [];
  // A MISSING snapshot is never "user-held": the envelope contract must still
  // fail closed for a product-lineage line that lost its resolver authority.
  // Only an actually resolved, semantically capable, uncalibrated product
  // relaxes the envelope.
  const anyUserHeld = mains.some(
    (item) =>
      input.snapshots[item.id] !== undefined &&
      resolveMainCapability({ snapshot: input.snapshots[item.id], snapshotRequired: true })
        .userHeld,
  );
  return anyUserHeld ? mains.map((item) => item.id) : [];
}
