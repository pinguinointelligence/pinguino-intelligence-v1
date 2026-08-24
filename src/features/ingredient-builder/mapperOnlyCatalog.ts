import type { EngineIngredient } from '@/engine';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { CatalogProductSearchHit } from '@/features/global-catalog/contracts';

/** Immutable source pin for the current Mapper catalog. Any Mapper publication
 * must move this key together with the source CSV and server projection. */
export const CURRENT_MAPPER_CATALOG_CACHE_KEY =
  'mapper:v1.0:sha256:b13f5db4affd9c3be5ccbe59b40920053197a3697a3fa1bd4a859406e8baed38';

export const MAPPER_ONLY_CATALOG_ERROR =
  'Produkt nie należy do aktualnego katalogu składników. Odśwież katalog i wybierz produkt ponownie.';

export type MapperCatalogContext = 'BASE' | 'TOPPING';
export type CatalogRelation = {
  entityKind: 'pi_base' | 'commercial_product';
  id: string;
};

const canonicalPiId = /^PI-ING-\d{6}$/;

/**
 * The engine-usable identity a picker hit resolves to, or null.
 *
 * A recipe line's physics always belong to a verified Mapper row — that part never
 * moves. What changed is where the CATALOGUE entry may come from: a hit no longer has
 * to BE a Mapper Basement row, it has to RESOLVE to one through the shared Product
 * Intelligence authority. A commercial product carries `mappedIngredientId` only when
 * that mapping was authorized, and the server behaviour resolver re-checks the whole
 * chain before the line is accepted, so this is a widening of the catalogue, not of the
 * authority (owner decision 2026-08-24 §1).
 */
export function currentMapperCatalogId(
  hit: CatalogProductSearchHit,
  context: MapperCatalogContext,
): string | null {
  const id = hit.mappedIngredientId;
  if (
    typeof hit.currentVersionId !== 'string' ||
    hit.currentVersionId.trim() === '' ||
    typeof id !== 'string' ||
    !canonicalPiId.test(id) ||
    hit.publicData.lifecycleRejected === true
  )
    return null;
  // A Mapper row must still present itself as one; a catalogue product must not be
  // blocked. Neither may enter a scope it is not usable in.
  if (hit.entityKind === 'pi_base') {
    if (hit.status !== 'pi_base') return null;
  } else if (hit.entityKind === 'commercial_product') {
    if (hit.status === 'blocked') return null;
  } else return null;
  if (context === 'BASE' ? !hit.usableInBase : !hit.usableAsTopping) return null;
  return id;
}

/** True when the hit is a catalogue product borrowing an authorized Mapper identity. */
export function isMappedCatalogProduct(hit: CatalogProductSearchHit): boolean {
  return hit.entityKind === 'commercial_product' && typeof hit.mappedIngredientId === 'string';
}

export function filterCurrentMapperCatalogHits(
  hits: readonly CatalogProductSearchHit[],
  context: MapperCatalogContext,
): CatalogProductSearchHit[] {
  const byIdentity = new Map<string, CatalogProductSearchHit>();
  for (const hit of hits) {
    const mapperId = currentMapperCatalogId(hit, context);
    if (!mapperId) continue;
    // Mapper rows collapse to one entry per identity, as before. A catalogue product
    // keyed by its own id stands beside its Mapper row rather than hiding it: they are
    // two catalogue entries for the same physics, and the owner picked one of them.
    const key = hit.entityKind === 'pi_base' ? `mapper:${mapperId}` : `product:${hit.id}`;
    if (!byIdentity.has(key)) byIdentity.set(key, hit);
  }
  return [...byIdentity.values()];
}

/** Favorites/recents are ranking references, never product snapshots. Unknown,
 * stale and commercial IDs are ignored without producing empty rows. */
export function filterCurrentMapperCatalogRelations(
  relations: readonly CatalogRelation[],
  accessibleMapperIds: ReadonlySet<string>,
): CatalogRelation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    if (
      relation.entityKind !== 'pi_base' ||
      !accessibleMapperIds.has(relation.id) ||
      seen.has(relation.id)
    )
      return false;
    seen.add(relation.id);
    return true;
  });
}

export type MapperCatalogSelection =
  | { ok: true; mapperId: string; row: IngredientRow }
  | { ok: false; message: typeof MAPPER_ONLY_CATALOG_ERROR };

/** Fail-closed selection boundary. The UI-supplied name, brand, status and
 * ingredient snapshot are never authoritative; only the current exact Mapper
 * row returned by the sanctioned view can cross into the recipe domain. */
export async function resolveCurrentMapperCatalogSelection(
  hit: CatalogProductSearchHit,
  context: MapperCatalogContext,
  loadCurrentRow: (mapperId: string) => Promise<IngredientRow | null>,
): Promise<MapperCatalogSelection> {
  const mapperId = currentMapperCatalogId(hit, context);
  if (!mapperId) return { ok: false, message: MAPPER_ONLY_CATALOG_ERROR };
  const row = await loadCurrentRow(mapperId).catch(() => null);
  if (
    !row ||
    row.ingredient_id !== mapperId ||
    row.dataset_version !== 'v1.0' ||
    row.approved_for_base !== true
  )
    return { ok: false, message: MAPPER_ONLY_CATALOG_ERROR };
  return { ok: true, mapperId, row };
}

/**
 * The recipe line for an accepted selection.
 *
 * The scientific row is the Mapper row, untouched — composition, POD/PAC, category and
 * flags all come from it, so the Engine sees exactly what it saw before. Only the NAME
 * follows the catalogue entry the owner actually chose: someone who scanned a specific
 * product should see that product in their recipe, not the generic ingredient behind it.
 * Identity for deduplication stays the Mapper id.
 */
export function engineIngredientForCatalogSelection(
  hit: CatalogProductSearchHit,
  selection: { mapperId: string; row: IngredientRow },
): EngineIngredient {
  const ingredient = ingredientRowToEngineIngredient(selection.row);
  if (!isMappedCatalogProduct(hit)) return ingredient;
  const displayName = hit.displayName.trim();
  return {
    ...ingredient,
    canonical_ingredient_id: selection.mapperId,
    identity_provenance: 'reference',
    ...(displayName ? { name: displayName } : {}),
  };
}

/** What a finished scan hands the recipe: the canonical product and the code it carries. */
export interface ScannedProductIdentity {
  id: string;
  displayName: string;
  barcode: string | null;
}

/**
 * The catalogue row a scanned product may enter the recipe as.
 *
 * A scan ends in the recipe (§37), but it does not get a private door into it. The
 * recipe accepts a CURRENT Mapper identity and nothing else, so the scanned product is
 * matched against the same filtered catalogue the picker itself shows — by GTIN first,
 * then by canonical identity. A commercial product that carries no current Mapper
 * identity resolves to null here, and the owner is told so rather than handed a line the
 * Engine cannot price or model.
 */
export function scannedProductRecipeTarget(
  hits: readonly CatalogProductSearchHit[],
  scanned: ScannedProductIdentity,
  context: MapperCatalogContext,
): CatalogProductSearchHit | null {
  const selectable = filterCurrentMapperCatalogHits(hits, context);
  const byBarcode = scanned.barcode
    ? (selectable.find((hit) => hit.eans.includes(scanned.barcode!)) ?? null)
    : null;
  if (byBarcode) return byBarcode;
  return (
    selectable.find((hit) => hit.id === scanned.id || hit.mappedIngredientId === scanned.id) ?? null
  );
}
