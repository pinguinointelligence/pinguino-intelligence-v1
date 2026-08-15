import type { RecipeItem } from '@/engine';
import type { FormulationStrategy } from '@/features/formulation-strategy/strategy';
import type { ProductBehaviorSnapshot } from '@/features/product-intelligence';

export type ProductDoseProvenance = 'NONE' | 'AUTO_SUGGESTED' | 'USER_SET' | 'UNKNOWN';

export interface ProductDoseMeta {
  provenance: ProductDoseProvenance;
  groupId: string | null;
  suggestedPercent: number | null;
  suggestedTotalGrams: number | null;
}

export const EMPTY_PRODUCT_DOSE_META: ProductDoseMeta = Object.freeze({
  provenance: 'NONE',
  groupId: null,
  suggestedPercent: null,
  suggestedTotalGrams: null,
});

export interface VerifiedProductDoseSuggestion {
  groupId: string;
  suggestedPercent: number;
  suggestedTotalGrams: number;
  policyId: string;
  policyVersion: string;
}

const finiteNonNegative = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;

/**
 * Resolve the picker-time dose exclusively from the immutable, server-resolved
 * policy snapshot. The policy expresses an equivalent share, so the exact
 * product share is divided by its approved equivalent factor just like the
 * existing Main-envelope verifier. Missing/incomplete authority stays unknown;
 * neither names nor catalog families are used to guess a dose.
 */
export function verifiedProductDoseSuggestion(input: {
  snapshot: ProductBehaviorSnapshot | null | undefined;
  strategy: FormulationStrategy;
  targetBaseGrams: number;
}): VerifiedProductDoseSuggestion | null {
  const { snapshot } = input;
  if (
    !snapshot ||
    snapshot.resolutionState !== 'RESOLVED' ||
    snapshot.processScope !== 'BASE_FORMULATION' ||
    snapshot.moduleEligibility.BASE_RECIPE !== 'eligible' ||
    snapshot.mainClassification !== 'MAIN_ALLOWED' ||
    !snapshot.mainPolicyId ||
    !snapshot.mainPolicyVersion ||
    !snapshot.mainBasis ||
    !finiteNonNegative(snapshot.ecoFloorPercent) ||
    !finiteNonNegative(snapshot.optimalCeilingPercent) ||
    snapshot.mainEquivalentFactor === null ||
    !Number.isFinite(snapshot.mainEquivalentFactor) ||
    snapshot.mainEquivalentFactor <= 0 ||
    !Number.isFinite(input.targetBaseGrams) ||
    input.targetBaseGrams <= 0
  ) {
    return null;
  }

  const equivalentPercent =
    input.strategy === 'eco' ? snapshot.ecoFloorPercent : snapshot.optimalCeilingPercent;
  const suggestedPercent = equivalentPercent / snapshot.mainEquivalentFactor;
  if (!Number.isFinite(suggestedPercent) || suggestedPercent < 0 || suggestedPercent > 100) {
    return null;
  }
  const suggestedTotalGrams = Math.round((input.targetBaseGrams * suggestedPercent) / 100);
  // A selected Base product cannot truthfully start below the product workflow's
  // minimum editable dose. Keep it in the explicit UNKNOWN/0 g path instead of
  // labelling a rounded zero as an approved automatic suggestion.
  if (suggestedTotalGrams < 1) return null;

  return {
    groupId: [
      snapshot.mainPolicyId,
      snapshot.mainPolicyVersion,
      snapshot.mainBasis,
      snapshot.mainEquivalentFactor,
    ].join(':'),
    suggestedPercent,
    suggestedTotalGrams,
    policyId: snapshot.mainPolicyId,
    policyVersion: snapshot.mainPolicyVersion,
  };
}

export interface DoseGroupMember {
  lineId: string;
  plannedGrams: number;
  lockType: RecipeItem['lock_type'];
  actualGrams: number | null;
  dose: ProductDoseMeta;
}

/**
 * Keep USER_SET, locked and physically-added lines byte-stable. Their current
 * grams consume the approved group total; only AUTO_SUGGESTED + unlocked lines
 * share the remaining whole grams. Stable input order receives the remainder,
 * so automatic members differ by at most 1 g and repeated runs are identical.
 */
export function allocateAutomaticDoseGroup(input: {
  groupId: string;
  suggestedTotalGrams: number;
  members: readonly DoseGroupMember[];
}): Readonly<Record<string, number>> {
  const automatic = input.members.filter(
    (member) =>
      member.dose.groupId === input.groupId &&
      member.dose.provenance === 'AUTO_SUGGESTED' &&
      member.lockType === 'unlocked' &&
      member.actualGrams === null,
  );
  if (automatic.length === 0) return {};

  const fixedGrams = input.members.reduce((sum, member) => {
    if (member.dose.groupId !== input.groupId || automatic.includes(member)) return sum;
    return sum + Math.max(0, member.plannedGrams);
  }, 0);
  const total = Math.max(0, Math.round(input.suggestedTotalGrams - fixedGrams));
  const quotient = Math.floor(total / automatic.length);
  const remainder = total - quotient * automatic.length;

  return Object.fromEntries(
    automatic.map((member, index) => [member.lineId, quotient + (index < remainder ? 1 : 0)]),
  );
}

export function missingProductDoseMessage(names: readonly string[]): string {
  return `Podaj gramaturę dla:\n${names.join(', ')}.\n\nMinimalna ilość to 1 g.`;
}
