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
  type ServerResolvedProductBehavior,
} from '@/features/product-intelligence';
import {
  isCatalogLabelToppingIngredient,
  type RecipeToppingIngredient,
} from '@/features/recipe-composition/labelTopping';
import { searchProducts } from '@/services/globalCatalog';
import { getEngineApprovedIngredientById } from '@/services/ingredients';
import { resolveProductBehaviorForSelection } from '@/services/productIntelligence';

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
  sleep: (ms: number) => Promise<void>;
}

const DEFAULT_DEPS: ScannedCatalogDeps = {
  searchProducts,
  loadCurrentRow: getEngineApprovedIngredientById,
  resolveBehavior: resolveProductBehaviorForSelection,
  sleep: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
};

type ProcessScope = 'BASE_FORMULATION' | 'POST_PROCESS_ADDON';

/**
 * The catalogue publishes a fresh product's canonical classification inside the save itself; this
 * short wait only covers a classification another event queued at the same moment.
 */
const CLASSIFICATION_WAIT_ATTEMPTS = 5;
const CLASSIFICATION_WAIT_MS = 1500;

/** the gate's first block code: `classification_pending:<ids>…` → `classification_pending` */
export function behaviorBlockCode(resolved: ServerResolvedProductBehavior): string {
  const first = resolved.blockReasons?.[0] ?? '';
  return first.split(':')[0] ?? '';
}

const NOT_ADMITTED_CODES = new Set([
  'product_rejected',
  'approved_for_base_false',
  'approved_for_engines_false',
  'profile_not_approved',
  'main_policy_not_approved',
  'module_permission_missing',
  'module_not_eligible',
]);

/**
 * What the customer reads when the catalogue will not let the product in. Never an internal id or
 * a code (Gellatti customer-language rule); the PRO workbench keeps its own technical wording.
 */
export function customerBlockedMessage(
  resolved: ServerResolvedProductBehavior,
  scope: ProcessScope,
): string {
  const code = behaviorBlockCode(resolved);
  if (code === 'classification_pending') {
    return 'produkt jest zapisany, ale katalog jeszcze kończy jego klasyfikację. Dodaj go za chwilę z listy produktów.';
  }
  if (code === 'classification_failed') {
    return 'produkt jest zapisany, ale katalog nie zdołał go sklasyfikować. Zeskanuj go ponownie.';
  }
  if (code === 'nutrition_facts_missing' || code === 'missing_technical_fields') {
    return 'wymaga uzupełnienia danych produktu przed dodaniem do receptury.';
  }
  if (NOT_ADMITTED_CODES.has(code)) {
    return scope === 'BASE_FORMULATION'
      ? 'nie nadaje się do bazy tej receptury.'
      : 'nie nadaje się jako dodatek do tej receptury.';
  }
  return 'wymaga odświeżenia danych produktu przed dodaniem do receptury.';
}

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
  const context: ProductBehaviorContext = {
    ...behaviorContext,
    processScope: scope,
    requestedRole: 'STANDARD',
    module: scope === 'BASE_FORMULATION' ? 'BASE_RECIPE' : 'TOPPING',
  };
  let resolved: ServerResolvedProductBehavior | null = null;
  for (let attempt = 0; attempt < CLASSIFICATION_WAIT_ATTEMPTS; attempt += 1) {
    resolved = await deps.resolveBehavior({ entity, context }).catch(() => null);
    if (!resolved || resolved.state !== 'blocked') break;
    if (behaviorBlockCode(resolved) !== 'classification_pending') break;
    await deps.sleep(CLASSIFICATION_WAIT_MS);
  }
  if (!resolved) {
    return {
      ok: false,
      message: 'nie udało się potwierdzić aktualnych danych produktu. Spróbuj ponownie.',
    };
  }
  if (resolved.state === 'blocked') {
    return { ok: false, message: customerBlockedMessage(resolved, scope) };
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
