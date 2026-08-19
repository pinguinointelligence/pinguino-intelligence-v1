import type { ProductBehaviorModule, ProductBehaviorSnapshot } from './contracts';
import { hasCanonicalIngredientIdentity } from '@/data/ingredients/canonicalIngredientIdentity';

export interface ProductBehaviorModuleGate {
  ready: boolean;
  blockedLineIds: string[];
  reason: string | null;
}

const LEGACY_READ_ONLY_MODULES = new Set<ProductBehaviorModule>([
  'MONITOR',
  'SUMMARY',
  'NUTRITION',
  'ALLERGENS',
  'PROCESS',
  'LABEL',
  'MASTER_LABEL',
  'EXPORT',
  'COST',
]);

/**
 * Trustless recipe boundary for resolved products. Callers pass every line ID
 * whose product lineage requires a Unified Product Intelligence snapshot; a
 * missing snapshot and a denied module permission fail through the same gate.
 */
export function productBehaviorModuleGate(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
  module: ProductBehaviorModule,
  requiredLineIds: readonly string[],
): ProductBehaviorModuleGate {
  const required = new Set(requiredLineIds);
  const missingLineIds = requiredLineIds.filter((lineId) => snapshots[lineId] === undefined);
  const blockedLineIds = [
    ...new Set([
      ...missingLineIds,
      ...Object.entries(snapshots)
        .filter((entry): entry is [string, ProductBehaviorSnapshot] => entry[1] !== undefined)
        .filter(([lineId]) => required.has(lineId))
        .filter(([, snapshot]) => {
          if (snapshot.resolutionState === 'REVALIDATION_REQUIRED') return true;
          if (
            snapshot.resolutionState === 'LEGACY_RECONSTRUCTED' &&
            !LEGACY_READ_ONLY_MODULES.has(module)
          )
            return true;
          const state = snapshot.moduleEligibility[module];
          return state !== 'eligible' && state !== 'label_only';
        })
        .map(([lineId]) => lineId),
    ]),
  ].sort();

  return blockedLineIds.length === 0
    ? { ready: true, blockedLineIds: [], reason: null }
    : {
        ready: false,
        blockedLineIds,
        reason: `Brak zatwierdzonego uprawnienia ${module} dla: ${blockedLineIds.join(', ')}.`,
      };
}

/** A line created by Mapper/private/catalog intake, or by the closed exact
 * built-in-to-Mapper bridge, must carry the immutable resolver snapshot.
 * Only synthetic fixtures with no canonical product lineage stay outside the
 * persistence gate. */
export function productBehaviorRequiredLineIds(input: {
  items: ReadonlyArray<{
    id: string;
    planned_grams?: number;
    actual_grams?: number | null;
    ingredient: { id?: string; identity_provenance?: string };
  }>;
  toppings?: ReadonlyArray<{
    id: string;
    planned_grams?: number;
    actual_grams?: number | null;
    ingredient: {
      id?: string;
      identity_provenance?: string;
      kind?: string;
      catalog_product_id?: string;
    };
  }>;
}): string[] {
  const base = input.items
    .filter(
      ({ planned_grams, actual_grams, ingredient }) =>
        (typeof planned_grams !== 'number' || (actual_grams ?? planned_grams) > 0) &&
        (hasCanonicalIngredientIdentity(ingredient.id) ||
          ingredient.identity_provenance === 'mapper' ||
          ingredient.identity_provenance === 'private_product' ||
          ingredient.identity_provenance === 'reference'),
    )
    .map(({ id }) => id);
  const toppings = (input.toppings ?? [])
    .filter(
      ({ planned_grams, actual_grams, ingredient }) =>
        (typeof planned_grams !== 'number' || (actual_grams ?? planned_grams) > 0) &&
        (ingredient.kind === 'catalog_label_topping' ||
          typeof ingredient.catalog_product_id === 'string' ||
          hasCanonicalIngredientIdentity(ingredient.id) ||
          ingredient.identity_provenance === 'mapper' ||
          ingredient.identity_provenance === 'private_product' ||
          ingredient.identity_provenance === 'reference'),
    )
    .map(({ id }) => id);
  return [...new Set([...base, ...toppings])].sort();
}

export function mainBehaviorBlockReason(
  snapshot: ProductBehaviorSnapshot | null | undefined,
  snapshotRequired = false,
): string | null {
  if (!snapshot) {
    return snapshotRequired
      ? 'Produkt wymaga ponownej walidacji przed ustawieniem jako Main.'
      : null;
  }
  if (snapshot.resolutionState !== 'RESOLVED') {
    return 'Historyczny produkt wymaga utworzenia nowej, zweryfikowanej wersji przed ustawieniem jako Main.';
  }
  if (snapshot.processScope !== 'BASE_FORMULATION') {
    return 'Topping nie może pełnić roli Main.';
  }
  // Main is a formulation objective, not a sensory-policy entitlement. The
  // historical MAIN classification/envelope remains recommendation metadata;
  // technical Base eligibility is the runtime authority for the crown.
  if (snapshot.moduleEligibility.BASE_RECIPE !== 'eligible') {
    return 'Produkt nie jest technicznie dostępny w bazie tej receptury.';
  }
  return null;
}

export function productBehaviorCanBeMain(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): boolean {
  return mainBehaviorBlockReason(snapshot) === null;
}
