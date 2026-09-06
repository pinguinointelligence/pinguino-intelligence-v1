/**
 * A scanned CATALOG product (the customer's own scanned article or a shared commercial product)
 * enters a HOME recipe through the SAME door the PRO picker uses: the catalogue search projection,
 * the fail-closed Mapper/catalogue selection, the product's own immutable profile and the
 * ProductBehavior authority. HOME adds no selection logic of its own; a Mapper reference row
 * (pi_base) keeps taking the typed-ingredient path (`hydrateIngredient`).
 *
 * Owner QA 2026-09-06: a ready scanned product was refused in HOME with "not ready yet" because HOME
 * hydrated it as a Mapper row — the door PRO takes did not exist in HOME.
 */
import type { EngineIngredient } from '@/engine';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import {
  engineIngredientForCatalogSelection,
  resolveCurrentMapperCatalogSelection,
  scannedProductRecipeTarget,
} from '@/features/ingredient-builder/mapperOnlyCatalog';
import {
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorContext,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import { isCatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { searchProducts } from '@/services/globalCatalog';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import {
  productBehaviorBlockedMessage,
  resolveProductBehaviorForSelection,
} from '@/services/productIntelligence';

export interface ScannedCatalogIdentity {
  id: string;
  barcode: string | null;
  displayName: string;
}

export type HomeBehaviorContext = Omit<
  ProductBehaviorContext,
  'processScope' | 'requestedRole' | 'module'
>;

export type ScannedCatalogOutcome =
  | { kind: 'ingredient'; ingredient: EngineIngredient; behavior: ProductBehaviorSnapshot | null }
  /** the product exists and is usable — as an add-on (topping), not in the base */
  | { kind: 'topping_only' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'unresolved' };

export interface ScannedCatalogDeps {
  searchProducts: typeof searchProducts;
  loadCurrentRow: typeof getEngineApprovedIngredientById;
  resolveBehavior: typeof resolveProductBehaviorForSelection;
}

const DEFAULT_DEPS: ScannedCatalogDeps = {
  searchProducts,
  loadCurrentRow: getEngineApprovedIngredientById,
  resolveBehavior: resolveProductBehaviorForSelection,
};

/** the catalogue rows the scanned identity may stand for, by barcode first, then by name */
async function catalogHits(
  scanned: ScannedCatalogIdentity,
  deps: ScannedCatalogDeps,
): Promise<CatalogProductSearchHit[]> {
  const queries = [scanned.barcode, scanned.displayName].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
  const results = await Promise.all(
    queries.map((query) =>
      deps
        .searchProducts({ query, context: 'BASE', marketScope: 'global', limit: 20 })
        .catch(() => [] as CatalogProductSearchHit[]),
    ),
  );
  return results.flat();
}

export async function hydrateScannedCatalogProduct(
  scanned: ScannedCatalogIdentity,
  behaviorContext: HomeBehaviorContext | null,
  deps: ScannedCatalogDeps = DEFAULT_DEPS,
): Promise<ScannedCatalogOutcome> {
  const hits = await catalogHits(scanned, deps);
  const hit = scannedProductRecipeTarget(hits, scanned, 'BASE');
  if (!hit) {
    return scannedProductRecipeTarget(hits, scanned, 'TOPPING')
      ? { kind: 'topping_only' }
      : { kind: 'unresolved' };
  }
  const selection = await resolveCurrentMapperCatalogSelection(hit, 'BASE', deps.loadCurrentRow);
  if (!selection.ok) return { kind: 'unavailable', message: selection.message };
  const ingredient = engineIngredientForCatalogSelection(hit, selection);
  if (!ingredient) {
    return {
      kind: 'unavailable',
      message: 'wymaga uzupełnienia danych produktu przed dodaniem do receptury.',
    };
  }
  if (isCatalogLabelToppingIngredient(ingredient)) return { kind: 'topping_only' };

  let behavior: ProductBehaviorSnapshot | null = null;
  if (behaviorContext) {
    const entity =
      hit.entityKind === 'pi_base' && hit.mappedIngredientId
        ? { entityKind: 'mapper' as const, entityId: hit.mappedIngredientId }
        : hit.currentVersionId
          ? { entityKind: 'catalog_product_version' as const, entityId: hit.currentVersionId }
          : null;
    if (!entity) {
      return { kind: 'unavailable', message: 'wymaga odświeżenia danych produktu przed dodaniem.' };
    }
    const resolved = await deps
      .resolveBehavior({
        entity,
        context: {
          ...behaviorContext,
          processScope: 'BASE_FORMULATION',
          requestedRole: 'STANDARD',
          module: 'BASE_RECIPE',
        },
      })
      .catch(() => null);
    if (!resolved || resolved.state === 'blocked') {
      return {
        kind: 'unavailable',
        message: resolved
          ? productBehaviorBlockedMessage(resolved)
          : 'nie udało się potwierdzić aktualnych danych produktu. Spróbuj ponownie.',
      };
    }
    behavior = snapshotServerResolvedProductBehavior({
      lineId: '',
      processScope: 'BASE_FORMULATION',
      resolved,
    });
  }
  return { kind: 'ingredient', ingredient, behavior };
}
