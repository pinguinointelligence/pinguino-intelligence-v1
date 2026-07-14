/**
 * PINGÜINO Product Picker — canonical INGREDIENT (Mapper Basement) catalogue.
 *
 * The "Składniki PI" side of the unified search: the real `mapper_basement`
 * technological ingredient library (PI-ING-* ids, PAC/POD). Read-only, pure
 * mapping + search. It NEVER invents pac/pod (unknown stays null) and NEVER writes
 * the locked reference base. A Mapper ingredient with resolvable engine values is
 * usable for exact calculation WITHOUT needing a row in the Products table.
 */
import { normalizeName, toFiniteNumber } from '@/data/products/productMatcher';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';

/** One Mapper Basement ingredient the picker can display + resolve. */
export interface IngredientCatalogueEntry {
  /** Stable ingredient id (PI-ING-…) attached to the recipe line on selection. */
  ingredientId: string;
  displayName: string;
  internalName: string | null;
  category: string | null;
  subcategory: string | null;
  /** Engine values — null when unknown (never invented). */
  pac: number | null;
  pod: number | null;
  /** true only when BOTH pac and pod are present → usable for exact calculation. */
  engineReady: boolean;
  verificationStatus: string;
}

/** Map one canonical `mapper_basement` row to a picker ingredient entry. Pure. */
export function ingredientRowToCatalogueEntry(row: IngredientRow): IngredientCatalogueEntry {
  const pac = toFiniteNumber(row.pac_value);
  const pod = toFiniteNumber(row.pod_value);
  return {
    ingredientId: row.ingredient_id,
    displayName: row.ingredient_name_display,
    internalName: row.ingredient_name_internal ?? null,
    category: row.ingredient_category ?? null,
    subcategory: row.ingredient_subcategory ?? null,
    pac,
    pod,
    engineReady: pac !== null && pod !== null,
    verificationStatus: row.verification_status,
  };
}

/** Why an ingredient matched (honest, enumerable). */
export type IngredientMatchedOn = 'ingredient_id' | 'exact_name' | 'name_contains' | 'category';

export interface IngredientSearchResult {
  entry: IngredientCatalogueEntry;
  matchedOn: IngredientMatchedOn;
}

const NAMES = (e: IngredientCatalogueEntry): string[] =>
  [normalizeName(e.displayName), normalizeName(e.internalName)].filter((n) => n !== '');

/**
 * Search the ingredient library by id / display + internal name / category.
 * Blank text with a category browses that category; blank text with no category
 * returns []. Deterministic: id > exact name > name-contains > category, then by name.
 */
export function searchIngredientCatalogue(
  query: { text: string; category?: string | null },
  entries: readonly IngredientCatalogueEntry[],
): IngredientSearchResult[] {
  const wantCategory = normalizeName(query.category ?? '');
  const text = query.text.trim();
  const q = normalizeName(text);
  const idRaw = text.toLowerCase();

  const rank: Record<IngredientMatchedOn, number> = {
    ingredient_id: 0,
    exact_name: 1,
    name_contains: 2,
    category: 3,
  };

  const rows: IngredientSearchResult[] = [];
  for (const entry of entries) {
    if (wantCategory !== '' && normalizeName(entry.category) !== wantCategory) continue;
    if (text === '') {
      if (wantCategory !== '') rows.push({ entry, matchedOn: 'category' });
      continue;
    }
    const names = NAMES(entry);
    let matchedOn: IngredientMatchedOn | null = null;
    if (entry.ingredientId.toLowerCase() === idRaw) matchedOn = 'ingredient_id';
    else if (names.includes(q)) matchedOn = 'exact_name';
    else if (names.some((n) => n.includes(q) || q.includes(n))) matchedOn = 'name_contains';
    else if (normalizeName(entry.category).includes(q) && q !== '') matchedOn = 'category';
    if (matchedOn !== null) rows.push({ entry, matchedOn });
  }

  return rows.sort(
    (a, b) =>
      rank[a.matchedOn] - rank[b.matchedOn] ||
      normalizeName(a.entry.displayName).localeCompare(normalizeName(b.entry.displayName)),
  );
}

/** The port the ingredient search reads (backend adapter, mock in tests). */
export interface IngredientCatalogPort {
  fetch(): Promise<IngredientCatalogueEntry[]>;
}
