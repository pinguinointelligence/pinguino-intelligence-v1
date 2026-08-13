import type { ProductBehaviorModule, ProductBehaviorSnapshot } from './contracts';

export interface ProductBehaviorModuleGate {
  ready: boolean;
  blockedLineIds: string[];
  reason: string | null;
}

/**
 * Trustless recipe boundary for already-resolved products. Legacy recipe lines
 * without a Unified Product Intelligence snapshot retain their accepted
 * behaviour. Once a line has a snapshot, however, no consumer may reinterpret
 * it or silently continue when the named module permission is absent.
 */
export function productBehaviorModuleGate(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
  module: ProductBehaviorModule,
): ProductBehaviorModuleGate {
  const blockedLineIds = Object.entries(snapshots)
    .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
    .filter(([, snapshot]) => {
      const state = snapshot.moduleEligibility[module];
      return state !== 'eligible' && state !== 'label_only';
    })
    .map(([lineId]) => lineId)
    .sort();

  return blockedLineIds.length === 0
    ? { ready: true, blockedLineIds: [], reason: null }
    : {
        ready: false,
        blockedLineIds,
        reason: `Brak zatwierdzonego uprawnienia ${module} dla: ${blockedLineIds.join(', ')}.`,
      };
}

export function mainBehaviorBlockReason(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): string | null {
  if (!snapshot) return null;
  if (snapshot.processScope !== 'BASE_FORMULATION') {
    return 'Topping nie może pełnić roli Main.';
  }
  if (snapshot.moduleEligibility.MAIN !== 'eligible') {
    return snapshot.blockReasons[0] === 'main_policy_unknown'
      ? 'Brak zatwierdzonego zakresu Main dla tego produktu i profilu.'
      : 'Produkt nie jest zatwierdzony jako Main w tym profilu.';
  }
  if (
    snapshot.mainClassification !== 'MAIN_ALLOWED' &&
    snapshot.mainClassification !== 'MAIN_PROFILE_SPECIFIC'
  ) {
    return snapshot.mainClassification === 'PROTEIN_CONTRIBUTOR_ONLY'
      ? 'Składnik białkowy nie jest automatycznie smakiem Main.'
      : 'Produkt nie jest składnikiem smakowym Main.';
  }
  if (
    !snapshot.mainPolicyId ||
    !snapshot.mainPolicyVersion ||
    snapshot.ecoFloorPercent === null ||
    snapshot.optimalCeilingPercent === null ||
    snapshot.hardLimitPercent === null ||
    snapshot.mainEquivalentFactor === null
  ) {
    return 'Brak zatwierdzonego zakresu Main dla tego produktu i profilu.';
  }
  return null;
}

export function productBehaviorCanBeMain(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): boolean {
  return mainBehaviorBlockReason(snapshot) === null;
}
