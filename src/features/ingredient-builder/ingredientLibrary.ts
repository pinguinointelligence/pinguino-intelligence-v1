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
import type { EngineIngredient } from '@/engine';

export type LibrarySource = 'demo' | 'pi_base';
export type LibraryStatus = 'demo' | 'loading' | 'ready' | 'fallback';

/** id → lowercased search haystack for that ingredient. */
export type SearchIndex = ReadonlyMap<string, string>;

export interface IngredientLibrary {
  ingredients: readonly EngineIngredient[];
  /** Per-ingredient search text (richer than EngineIngredient for PI Base rows). */
  searchIndex: SearchIndex;
  source: LibrarySource;
  status: LibraryStatus;
}

/** Whether the PI Base query should run. Pro + not the demo route. */
export function shouldFetchLibrary({ isPro, demo }: { isPro: boolean; demo: boolean }): boolean {
  return isPro && !demo;
}

/** Demo ingredients can only be searched by what they carry: name, id, category. */
function demoSearchText(ingredient: EngineIngredient): string {
  return `${ingredient.name} ${ingredient.id} ${ingredient.category}`.toLowerCase();
}

/** PI Base rows carry richer fields: name, internal name, id, brand, raw +
 * engine category, and subcategory. */
function rowSearchText(row: IngredientRow, engineCategory: string): string {
  return [
    row.ingredient_name_display,
    row.ingredient_name_internal,
    row.ingredient_id,
    row.brand,
    row.ingredient_category, // raw dataset category (e.g. "chocolate")
    engineCategory, // mapped engine category (e.g. "chocolate_cocoa")
    row.ingredient_subcategory,
  ]
    .filter((part) => part && part.trim() !== '')
    .join(' ')
    .toLowerCase();
}

function demoLibrary(status: LibraryStatus): IngredientLibrary {
  const searchIndex = new Map(DEMO_INGREDIENTS.map((i) => [i.id, demoSearchText(i)]));
  return { ingredients: DEMO_INGREDIENTS, searchIndex, source: 'demo', status };
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
    return { ingredients: [], searchIndex: new Map(), source: 'pi_base', status: 'loading' };
  }
  if (rows.length === 0) {
    // RLS returned nothing / not seeded / backend unavailable.
    return demoLibrary('fallback');
  }

  const ingredients: EngineIngredient[] = [];
  const searchIndex = new Map<string, string>();
  for (const row of rows) {
    const ingredient = ingredientRowToEngineIngredient(row);
    ingredients.push(ingredient);
    searchIndex.set(ingredient.id, rowSearchText(row, ingredient.category));
  }
  return { ingredients, searchIndex, source: 'pi_base', status: 'ready' };
}

/**
 * Case-insensitive filter over the ingredient's search text (display name,
 * internal name, id, brand, raw + engine category, subcategory for PI Base;
 * name/id/category for demo).
 */
export function filterIngredients(
  ingredients: readonly EngineIngredient[],
  rawQuery: string,
  searchIndex: SearchIndex,
): readonly EngineIngredient[] {
  const q = rawQuery.trim().toLowerCase();
  if (q === '') return ingredients;
  return ingredients.filter((i) => {
    const haystack = searchIndex.get(i.id) ?? demoSearchText(i);
    return haystack.includes(q);
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
