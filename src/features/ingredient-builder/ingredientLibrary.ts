/**
 * Pure ingredient-library logic for the Advanced Studio picker. No React, no
 * data access — just decision + shaping functions so everything is testable in
 * node without a DOM.
 *
 * The picker shows the PI Base library only for PI Pro members on /studio; every
 * other case (demo route, non-Pro, error, empty, not-yet-loaded) resolves to the
 * local demo catalog. Real access enforcement is the database RLS; these checks
 * are UX only (avoid needless fetches, no demo flash for Pro users).
 */
import { DEMO_INGREDIENTS } from '@/data/demoIngredients';
import { ingredientRowToEngineIngredient } from '@/data/ingredients/ingredientMapper';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import type { ProductLibraryProvenance } from '@/data/products/productEngineLibrary';
import type { EngineIngredient } from '@/engine';
import { haystackMatchesQuery, normalizeSearchText } from './ingredientSearch';

export type LibrarySource = 'demo' | 'pi_base';
export type LibraryStatus = 'demo' | 'loading' | 'ready' | 'fallback';

/** id → lowercased search haystack for that ingredient. */
export type SearchIndex = ReadonlyMap<string, string>;

export interface IngredientLibrary {
  ingredients: readonly EngineIngredient[];
  /** Per-ingredient search text (richer than EngineIngredient for PI Base rows). */
  searchIndex: SearchIndex;
  /** id → NORMALIZED name-only text (display + internal) — semantic-vs-SKU ranking (owner P0). */
  nameIndex: SearchIndex;
  /** id → Mapper subcategory (the „form": fresh_fruit_profile / *_paste / *_soda …). */
  formIndex: SearchIndex;
  source: LibrarySource;
  status: LibraryStatus;
  /** Owner P0: Pro searches the LIVE backend per query — no preloaded catalogue.
   * false = the local demo/fallback catalog (12 preview ingredients). */
  serverSearch: boolean;
  /** The owner's confirmed products as engine ingredients ("My Products" group). The base
   * selector leaves this empty; the hook fills it from buildProductEngineLibrary. */
  products: readonly EngineIngredient[];
  /** product EngineIngredient.id → provenance (reference-linked / red-flag) for the badge. */
  productProvenance: ReadonlyMap<string, ProductLibraryProvenance>;
}

/** Default empty "My Products" group — the basement selector never builds products itself. */
const NO_PRODUCTS = {
  products: [] as readonly EngineIngredient[],
  productProvenance: new Map() as ReadonlyMap<string, ProductLibraryProvenance>,
};

/** Whether the PI Base query should run. Pro + not the demo route. */
export function shouldFetchLibrary({ isPro, demo }: { isPro: boolean; demo: boolean }): boolean {
  return isPro && !demo;
}

/** Demo ingredients can only be searched by what they carry: name, id, category.
 * NORMALIZED (owner P0): diacritics stripped + punctuation unified so Polish queries match. */
function demoSearchText(ingredient: EngineIngredient): string {
  return normalizeSearchText(`${ingredient.name} ${ingredient.id} ${ingredient.category}`);
}

/** PI Base rows carry richer fields: name, internal name (PL), id, brand, raw + engine
 * category, and subcategory. NORMALIZED so „wanilia" (internal) / „truskawki" (plural) match. */
function rowSearchText(row: IngredientRow, engineCategory: string): string {
  return normalizeSearchText(
    [
      row.ingredient_name_display,
      row.ingredient_name_internal,
      row.ingredient_id,
      row.brand,
      row.ingredient_category, // raw dataset category (e.g. "chocolate")
      engineCategory, // mapped engine category (e.g. "chocolate_cocoa")
      row.ingredient_subcategory,
    ]
      .filter((part) => part && part.trim() !== '')
      .join(' '),
  );
}

function demoLibrary(status: LibraryStatus): IngredientLibrary {
  const searchIndex = new Map(DEMO_INGREDIENTS.map((i) => [i.id, demoSearchText(i)]));
  const nameIndex = new Map(DEMO_INGREDIENTS.map((i) => [i.id, normalizeSearchText(i.name)]));
  const formIndex = new Map(DEMO_INGREDIENTS.map((i) => [i.id, i.category]));
  return {
    ingredients: DEMO_INGREDIENTS, searchIndex, nameIndex, formIndex,
    source: 'demo', status, serverSearch: false, ...NO_PRODUCTS,
  };
}

/**
 * Owner P0 (live complete Mapper search): the canonical Pro library carries NO
 * preloaded catalogue — every settled picker query hits the live backend
 * (`useIngredientSearch`). This is the ONLY Pro library shape.
 */
export function serverSearchLibrary(): IngredientLibrary {
  return {
    ingredients: [], searchIndex: new Map(), nameIndex: new Map(), formIndex: new Map(),
    source: 'pi_base', status: 'ready', serverSearch: true, ...NO_PRODUCTS,
  };
}

export interface SelectLibraryArgs {
  demo: boolean;
  isPro: boolean;
  /** undefined = not loaded yet (query pending or disabled). */
  rows: IngredientRow[] | undefined;
  isError: boolean;
}

/**
 * Resolve which ingredient list the picker shows. Order matters: the demo route
 * and non-Pro users short-circuit to the demo catalog before any row is read,
 * so the full library is never exposed in /demo even if rows were present.
 */
export function selectIngredientLibrary({
  demo,
  isPro,
  rows,
  isError,
}: SelectLibraryArgs): IngredientLibrary {
  if (demo || !isPro) return demoLibrary('demo');
  if (isError) return demoLibrary('fallback');
  if (rows === undefined) {
    // Pro, fetching — show a loading state, never a demo flash.
    return {
      ingredients: [], searchIndex: new Map(), nameIndex: new Map(), formIndex: new Map(),
      source: 'pi_base', status: 'loading', serverSearch: false, ...NO_PRODUCTS,
    };
  }
  if (rows.length === 0) {
    // RLS returned nothing / not seeded / backend unavailable.
    return demoLibrary('fallback');
  }

  const ingredients: EngineIngredient[] = [];
  const searchIndex = new Map<string, string>();
  const nameIndex = new Map<string, string>();
  const formIndex = new Map<string, string>();
  for (const row of rows) {
    const ingredient = ingredientRowToEngineIngredient(row);
    ingredients.push(ingredient);
    searchIndex.set(ingredient.id, rowSearchText(row, ingredient.category));
    nameIndex.set(ingredient.id, normalizeSearchText(`${row.ingredient_name_display} ${row.ingredient_name_internal}`));
    formIndex.set(ingredient.id, row.ingredient_subcategory ?? '');
  }
  return {
    ingredients, searchIndex, nameIndex, formIndex,
    source: 'pi_base', status: 'ready', serverSearch: false, ...NO_PRODUCTS,
  };
}

/**
 * Filter over the ingredient's NORMALIZED search text (display + internal name + id + brand +
 * raw + engine category + subcategory for PI Base; name/id/category for demo). Natural-Polish
 * aware (owner P0): diacritics, plural/grammatical forms and PL↔EN↔IT↔ES aliases resolve via
 * `haystackMatchesQuery` — the exact/id/substring path still wins first so nothing regresses.
 */
export function filterIngredients(
  ingredients: readonly EngineIngredient[],
  rawQuery: string,
  searchIndex: SearchIndex,
): readonly EngineIngredient[] {
  if (rawQuery.trim() === '') return ingredients;
  return ingredients.filter((i) => {
    const haystack = searchIndex.get(i.id) ?? demoSearchText(i);
    return haystackMatchesQuery(haystack, rawQuery);
  });
}

export interface IngredientGroup {
  category: EngineIngredient['category'];
  items: EngineIngredient[];
}

/** Group ingredients by category, preserving first-appearance order. */
export function groupIngredientsByCategory(
  ingredients: readonly EngineIngredient[],
): IngredientGroup[] {
  return ingredients.reduce<IngredientGroup[]>((groups, ingredient) => {
    const existing = groups.find((group) => group.category === ingredient.category);
    if (existing) existing.items.push(ingredient);
    else groups.push({ category: ingredient.category, items: [ingredient] });
    return groups;
  }, []);
}
