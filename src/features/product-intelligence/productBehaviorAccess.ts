import type { ProductBehaviorModule, ProductBehaviorSnapshot } from './contracts';
import { hasCanonicalIngredientIdentity } from '@/data/ingredients/canonicalIngredientIdentity';
import { resolveMainCapability } from './mainCapability';

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
 * Is this workspace under managed product-behavior resolution?
 *
 * A workspace acquires managed status the moment the server resolver freezes
 * its first snapshot. While it holds none at all, no resolution has been
 * attempted (signed-out, demo/preset cold-open, or a pure Engine fixture) and
 * an absent snapshot is "not yet resolved", not "permission denied".
 *
 * The distinction matters because draft editing must not become dependent on
 * session/database state, while every boundary that publishes or persists the
 * draft must stay unconditional. Callers that guard on this are therefore only
 * the in-memory draft seams; SAVE, PRODUCTION and the recipe-wide constraint
 * authority deliberately gate with no managed check, so an unresolved
 * workspace can still be edited locally but can never be saved or produced.
 */
export function productBehaviorIsManaged(
  snapshots: Readonly<Record<string, ProductBehaviorSnapshot | undefined>>,
): boolean {
  return Object.keys(snapshots).length > 0;
}

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

/**
 * Owner-facing reason a line may not be Main, or null when it may.
 *
 * GLOBAL MAIN AUTHORITY (owner v1.4 §26): this is a thin projection of the one
 * canonical `resolveMainCapability` answer. It no longer decides eligibility
 * itself, and a missing calibrated envelope no longer blocks the owner's Main
 * intent — such a product resolves to user-held Main instead (§4, §5).
 */
export function mainBehaviorBlockReason(
  snapshot: ProductBehaviorSnapshot | null | undefined,
  snapshotRequired = false,
): string | null {
  if (!snapshot && !snapshotRequired) return null;
  const capability = resolveMainCapability({ snapshot, snapshotRequired });
  return capability.selectable ? null : capability.reasonPl;
}

export function productBehaviorCanBeMain(
  snapshot: ProductBehaviorSnapshot | null | undefined,
): boolean {
  return mainBehaviorBlockReason(snapshot) === null;
}
