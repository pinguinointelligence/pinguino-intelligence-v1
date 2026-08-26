import type { EngineIngredient, EngineIngredientFlags } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import { mapDatasetCategory } from '@/data/ingredients/categoryMapping';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { labelOnlyCatalogToppingIngredient } from '@/features/global-catalog/catalogIngredient';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';
import type { CatalogLabelToppingIngredient } from '@/features/recipe-composition/labelTopping';
import { carbonationProfileFromPublicData } from '@/data/products/carbonation';

/** Immutable source pin for the current PI catalog. */
export const CURRENT_MAPPER_CATALOG_CACHE_KEY =
  'mapper:v1.0:sha256:b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38';

export const MAPPER_ONLY_CATALOG_ERROR =
  'Produkt nie ma aktualnego kompletnego profilu technicznego. Odśwież katalog i spróbuj ponownie.';

export type MapperCatalogContext = 'BASE' | 'TOPPING';
export type CatalogRelation = {
  entityKind: 'pi_base' | 'commercial_product';
  id: string;
};

const canonicalPiId = /^PI-ING-\d{6}$/;
const canonicalProductId = /^(?:PR|PM|CA)-ING-\d{6}$/;

const objectAt = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const finiteAt = (value: Record<string, unknown>, key: string): number | null => {
  const candidate = value[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
};

const REQUIRED_PRODUCT_PROFILE = [
  'water', 'totalSolids', 'fat', 'protein', 'carbohydrate', 'sugars', 'salt',
] as const;

export function catalogProductHasOwnEngineProfile(hit: CatalogProductSearchHit): boolean {
  if (hit.entityKind !== 'commercial_product') return false;
  const technical = objectAt(hit.publicData.technicalComposition);
  const intelligence = objectAt(hit.publicData.productIntelligence);
  return Boolean(
    technical &&
      intelligence?.engineUsable === true &&
      REQUIRED_PRODUCT_PROFILE.every((key) => finiteAt(technical, key) !== null),
  );
}

/** One customer-facing article identity, independent of origin. */
export function currentCatalogArticleId(
  hit: CatalogProductSearchHit,
  context: MapperCatalogContext,
): string | null {
  if (
    typeof hit.currentVersionId !== 'string' ||
    hit.currentVersionId.trim() === '' ||
    hit.publicData.lifecycleRejected === true ||
    (context === 'BASE' ? !hit.usableInBase : !hit.usableAsTopping)
  ) return null;

  if (hit.entityKind === 'pi_base') {
    return hit.status === 'pi_base' && typeof hit.mappedIngredientId === 'string' &&
      canonicalPiId.test(hit.mappedIngredientId)
      ? hit.mappedIngredientId
      : null;
  }
  if (hit.entityKind !== 'commercial_product' || hit.status === 'blocked') return null;
  const articleId = hit.productCode?.trim() ?? '';
  if (!canonicalProductId.test(articleId)) return null;
  if (context === 'BASE' && !catalogProductHasOwnEngineProfile(hit)) return null;
  return articleId;
}

/** Backwards-compatible PI helper. Commercial articles intentionally return
 * null: their recipe identity is their own PR/PM/CA code. */
export function currentMapperCatalogId(
  hit: CatalogProductSearchHit,
  context: MapperCatalogContext,
): string | null {
  return hit.entityKind === 'pi_base' ? currentCatalogArticleId(hit, context) : null;
}

export function isMappedCatalogProduct(hit: CatalogProductSearchHit): boolean {
  return hit.entityKind === 'commercial_product' && typeof hit.mappedIngredientId === 'string';
}

/** Historical name retained for callers; the result is the unified PI+PR+PM
 * catalog, deduplicated by each article's own identity. */
export function filterCurrentMapperCatalogHits(
  hits: readonly CatalogProductSearchHit[],
  context: MapperCatalogContext,
): CatalogProductSearchHit[] {
  const byIdentity = new Map<string, CatalogProductSearchHit>();
  for (const hit of hits) {
    const articleId = currentCatalogArticleId(hit, context);
    if (articleId && !byIdentity.has(articleId)) byIdentity.set(articleId, hit);
  }
  return [...byIdentity.values()];
}

export function filterCurrentMapperCatalogRelations(
  relations: readonly CatalogRelation[],
  accessibleIds: ReadonlySet<string>,
): CatalogRelation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const key = `${relation.entityKind}:${relation.id}`;
    if (!accessibleIds.has(relation.id) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type MapperCatalogSelection =
  | { ok: true; kind: 'mapper'; articleId: string; mapperId: string; row: IngredientRow }
  | { ok: true; kind: 'catalog_product'; articleId: string; productVersionId: string }
  | { ok: false; message: typeof MAPPER_ONLY_CATALOG_ERROR };

/** Selection is fail-closed against the server search projection. PI reloads
 * its immutable Mapper row; PR/PM/CA carry their immutable version profile and are
 * subsequently revalidated by ProductBehavior before save/production. */
export async function resolveCurrentMapperCatalogSelection(
  hit: CatalogProductSearchHit,
  context: MapperCatalogContext,
  loadCurrentRow: (mapperId: string) => Promise<IngredientRow | null>,
): Promise<MapperCatalogSelection> {
  const articleId = currentCatalogArticleId(hit, context);
  if (!articleId) return { ok: false, message: MAPPER_ONLY_CATALOG_ERROR };
  if (hit.entityKind === 'commercial_product') {
    return {
      ok: true,
      kind: 'catalog_product',
      articleId,
      productVersionId: hit.currentVersionId!,
    };
  }
  const row = await loadCurrentRow(articleId).catch(() => null);
  if (
    !row ||
    row.ingredient_id !== articleId ||
    row.dataset_version !== 'v1.0' ||
    row.approved_for_base !== true
  ) return { ok: false, message: MAPPER_ONLY_CATALOG_ERROR };
  return { ok: true, kind: 'mapper', articleId, mapperId: articleId, row };
}

function catalogProductEngineIngredient(
  hit: CatalogProductSearchHit,
  selection: Extract<MapperCatalogSelection, { ok: true; kind: 'catalog_product' }>,
): EngineIngredient | null {
  const technical = objectAt(hit.publicData.technicalComposition);
  if (!technical || !catalogProductHasOwnEngineProfile(hit)) return null;
  const articleId = selection.articleId;
  const { category } = mapDatasetCategory(hit.category ?? '');
  const flags: EngineIngredientFlags = {};
  if (category === 'dairy') flags.is_dairy = true;
  if (category === 'stabilizer') flags.is_stabilizer = true;
  if (category === 'flavor') flags.is_flavor_booster = true;
  if (hit.publicData.vegan === false) flags.is_animal_origin = true;

  const composition: EngineIngredient['composition'] = {
    water_percent: finiteAt(technical, 'water')!,
    solids_percent: finiteAt(technical, 'totalSolids')!,
    fat_percent: finiteAt(technical, 'fat')!,
    protein_percent: finiteAt(technical, 'protein')!,
    carbohydrate_percent: finiteAt(technical, 'carbohydrate')!,
    sugar_percent: finiteAt(technical, 'sugars')!,
    sucrose_percent: finiteAt(technical, 'sucrose') ?? 0,
    glucose_percent: finiteAt(technical, 'glucose') ?? 0,
    dextrose_percent: finiteAt(technical, 'dextrose') ?? 0,
    fructose_percent: finiteAt(technical, 'fructose') ?? 0,
    lactose_percent: finiteAt(technical, 'lactose') ?? 0,
    polyol_percent: finiteAt(technical, 'polyols') ?? 0,
    fiber_percent: finiteAt(technical, 'fibre') ?? 0,
    salt_percent: finiteAt(technical, 'salt')!,
    alcohol_percent: finiteAt(technical, 'alcohol') ?? 0,
    kcal_per_100g: finiteAt(technical, 'energyKcal') ?? 0,
  };
  const saturatedFat = finiteAt(technical, 'saturatedFat');
  if (saturatedFat !== null) composition.saturated_fat_percent = saturatedFat;

  const productAccuracy = finiteAt(hit.publicData, 'productAccuracy') ?? 0;
  return {
    id: articleId,
    canonical_ingredient_id: articleId,
    private_product_id: `catalog:${hit.id}:version:${selection.productVersionId}`,
    identity_provenance: 'private_product',
    source_subcategory: hit.productForm?.trim() || null,
    carbonation_status:
      hit.carbonationStatus ?? carbonationProfileFromPublicData(hit.publicData).status,
    name: hit.displayName,
    category,
    composition,
    pod_value: finiteAt(technical, 'podValue'),
    pac_value: finiteAt(technical, 'pacValue'),
    de_value: finiteAt(technical, 'deValue'),
    cost_per_kg: hit.privatePricePerKg ?? null,
    cost_currency: hit.privatePriceCurrency ?? null,
    cost_source: hit.privatePricePerKg == null ? null : 'private',
    confidence_score: Math.min(100, Math.max(0, Math.round(productAccuracy))),
    source_type: hit.status === 'verified' ? 'producer_label' : 'external_db',
    is_verified: hit.status === 'verified',
    ...(Object.keys(flags).length > 0 ? { flags } : {}),
  };
}

export function engineIngredientForCatalogSelection(
  hit: CatalogProductSearchHit,
  selection: Extract<MapperCatalogSelection, { ok: true }>,
): EngineIngredient | CatalogLabelToppingIngredient | null {
  if (selection.kind === 'mapper') return ingredientRowToEngineIngredient(selection.row);
  return catalogProductEngineIngredient(hit, selection) ?? labelOnlyCatalogToppingIngredient(hit);
}

export interface ScannedProductIdentity {
  id: string;
  displayName: string;
  barcode: string | null;
}

export function scannedProductRecipeTarget(
  hits: readonly CatalogProductSearchHit[],
  scanned: ScannedProductIdentity,
  context: MapperCatalogContext,
): CatalogProductSearchHit | null {
  const selectable = filterCurrentMapperCatalogHits(hits, context);
  const byBarcode = scanned.barcode
    ? selectable.find((hit) => hit.eans.includes(scanned.barcode!)) ?? null
    : null;
  if (byBarcode) return byBarcode;
  return selectable.find(
    (hit) => currentCatalogArticleId(hit, context) === scanned.id || hit.id === scanned.id,
  ) ?? null;
}
