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
  type MapperCatalogContext,
} from '@/features/ingredient-builder/mapperOnlyCatalog';
import {
  snapshotServerResolvedProductBehavior,
  type ProductBehaviorContext,
  type ProductBehaviorSnapshot,
} from '@/features/product-intelligence';
import {
  isCatalogLabelToppingIngredient,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/labelTopping';
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
  /** the product is usable as an add-on (topping) — the very line the "Dodaj topping" picker adds */
  | {
      kind: 'topping';
      ingredient: RecipeToppingIngredient;
      behavior: ProductBehaviorSnapshot | null;
    }
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

type ProcessScope = 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';

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

/** the ProductBehavior authority for the hit in the scope the line will live in — the picker's call */
async function resolveBehavior(
  hit: CatalogProductSearchHit,
  scope: ProcessScope,
  behaviorContext: HomeBehaviorContext,
  deps: ScannedCatalogDeps,
): Promise<{ ok: true; behavior: ProductBehaviorSnapshot } | { ok: false; message: string }> {
  const entity =
    hit.entityKind === 'pi_base' && hit.mappedIngredientId
      ? { entityKind: 'mapper' as const, entityId: hit.mappedIngredientId }
      : hit.currentVersionId
        ? { entityKind: 'catalog_product_version' as const, entityId: hit.currentVersionId }
        : null;
  if (!entity) return { ok: false, message: 'wymaga odświeżenia danych produktu przed dodaniem.' };
  const resolved = await deps
    .resolveBehavior({
      entity,
      context: {
        ...behaviorContext,
        processScope: scope,
        requestedRole: 'STANDARD',
        module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
      },
    })
    .catch(() => null);
  if (!resolved || resolved.state === 'blocked') {
    return {
      ok: false,
      message: resolved
        ? productBehaviorBlockedMessage(resolved)
        : 'nie udało się potwierdzić aktualnych danych produktu. Spróbuj ponownie.',
    };
  }
  return {
    ok: true,
    behavior: snapshotServerResolvedProductBehavior({ lineId: '', processScope: scope, resolved }),
  };
}

type HydratedHit =
  | ScannedCatalogOutcome
  /** the BASE selection yielded a label-only article — it can only ever be an add-on */
  | { kind: 'label_only' };

async function hydrateCatalogHit(
  hit: CatalogProductSearchHit,
  context: MapperCatalogContext,
  behaviorContext: HomeBehaviorContext | null,
  deps: ScannedCatalogDeps,
): Promise<HydratedHit> {
  const selection = await resolveCurrentMapperCatalogSelection(hit, context, deps.loadCurrentRow);
  if (!selection.ok) return { kind: 'unavailable', message: selection.message };
  const ingredient = engineIngredientForCatalogSelection(hit, selection);
  if (!ingredient) {
    return {
      kind: 'unavailable',
      message: 'wymaga uzupełnienia danych produktu przed dodaniem do receptury.',
    };
  }
  if (context === 'BASE' && isCatalogLabelToppingIngredient(ingredient))
    return { kind: 'label_only' };
  const scope: ProcessScope = context === 'BASE' ? 'BASE_FORMULATION' : 'POST_PROCESS_ADDON';
  let behavior: ProductBehaviorSnapshot | null = null;
  if (behaviorContext) {
    const resolved = await resolveBehavior(hit, scope, behaviorContext, deps);
    if (!resolved.ok) return { kind: 'unavailable', message: resolved.message };
    behavior = resolved.behavior;
  }
  return context === 'BASE'
    ? { kind: 'ingredient', ingredient: ingredient as EngineIngredient, behavior }
    : { kind: 'topping', ingredient, behavior };
}

/**
 * Base first: a product the catalogue admits to the base becomes an ingredient line. Otherwise
 * (or when its base selection is label-only) the product takes the add-on door — the same
 * selection, profile and ProductBehavior call the "Dodaj topping" picker makes — and comes back
 * as a topping line, so a scanned granola is IN the recipe, not merely announced.
 */
export async function hydrateScannedCatalogProduct(
  scanned: ScannedCatalogIdentity,
  behaviorContext: HomeBehaviorContext | null,
  deps: ScannedCatalogDeps = DEFAULT_DEPS,
): Promise<ScannedCatalogOutcome> {
  const hits = await catalogHits(scanned, deps);
  const baseHit = scannedProductRecipeTarget(hits, scanned, 'BASE');
  if (baseHit) {
    const outcome = await hydrateCatalogHit(baseHit, 'BASE', behaviorContext, deps);
    if (outcome.kind !== 'label_only') return outcome;
  }
  const toppingHit = scannedProductRecipeTarget(hits, scanned, 'TOPPING');
  if (toppingHit) {
    const outcome = await hydrateCatalogHit(toppingHit, 'TOPPING', behaviorContext, deps);
    if (outcome.kind !== 'label_only') return outcome;
  }
  return baseHit
    ? {
        kind: 'unavailable',
        message:
          'nadaje się tylko jako dodatek (topping), a katalog nie dopuszcza go jeszcze w tej roli.',
      }
    : { kind: 'unresolved' };
}
