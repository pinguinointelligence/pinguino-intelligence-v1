import type { ProductBehaviorModule, ProductBehaviorSnapshot } from './contracts';

export interface ProductBehaviorModuleGate {
  ready: boolean;
  blockedLineIds: string[];
  reason: string | null;
}

/**
 * Trustless recipe boundary for resolved products. Callers pass every line ID
 * whose product lineage requires a Unified Product Intelligence snapshot; a
 * missing snapshot and a denied module permission fail through the same gate.
 */
export function productBehaviorModuleGate(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
  module: ProductBehaviorModule,
  requiredLineIds: readonly string[] = [],
): ProductBehaviorModuleGate {
  const missingLineIds = requiredLineIds.filter((lineId) => snapshots[lineId] === undefined);
  const blockedLineIds = [...new Set([
    ...missingLineIds,
    ...Object.entries(snapshots)
    .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
    .filter(([, snapshot]) => {
      const state = snapshot.moduleEligibility[module];
      return state !== 'eligible' && state !== 'label_only';
    })
    .map(([lineId]) => lineId),
  ])].sort();

  return blockedLineIds.length === 0
    ? { ready: true, blockedLineIds: [], reason: null }
    : {
        ready: false,
        blockedLineIds,
        reason: `Brak zatwierdzonego uprawnienia ${module} dla: ${blockedLineIds.join(', ')}.`,
      };
}

/** A line created by Mapper/private/catalog product intake must carry the
 * immutable resolver snapshot. Demo/template/reference fixtures without a
 * product lineage remain outside this persistence gate. */
export function productBehaviorRequiredLineIds(input: {
  items: ReadonlyArray<{ id: string; ingredient: { identity_provenance?: string } }>;
  toppings?: ReadonlyArray<{
    id: string;
    ingredient: { identity_provenance?: string; kind?: string; catalog_product_id?: string };
  }>;
}): string[] {
  const base = input.items
    .filter(({ ingredient }) =>
      ingredient.identity_provenance === 'mapper' ||
      ingredient.identity_provenance === 'private_product' ||
      ingredient.identity_provenance === 'reference',
    )
    .map(({ id }) => id);
  const toppings = (input.toppings ?? [])
    .filter(({ ingredient }) =>
      ingredient.kind === 'catalog_label_topping' ||
      typeof ingredient.catalog_product_id === 'string' ||
      ingredient.identity_provenance === 'mapper' ||
      ingredient.identity_provenance === 'private_product' ||
      ingredient.identity_provenance === 'reference',
    )
    .map(({ id }) => id);
  return [...new Set([...base, ...toppings])].sort();
}

export function mainBehaviorBlockReason(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): string | null {
  if (!snapshot) return null;
  if (snapshot.processScope !== 'BASE_FORMULATION') {
    return 'Topping nie może pełnić roli Main.';
  }
  if (snapshot.moduleEligibility.MAIN !== 'eligible') {
    return snapshot.mainClassification === 'MAIN_BLOCKED_POLICY' ||
      snapshot.blockReasons.includes('main_policy_missing')
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
