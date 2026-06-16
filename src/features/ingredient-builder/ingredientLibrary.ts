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

export interface IngredientLibrary {
  ingredients: readonly EngineIngredient[];
  source: LibrarySource;
  status: LibraryStatus;
}

/** Whether the PI Base query should run. Pro + not the demo route. */
export function shouldFetchLibrary({ isPro, demo }: { isPro: boolean; demo: boolean }): boolean {
  return isPro && !demo;
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
  if (demo || !isPro) {
    return { ingredients: DEMO_INGREDIENTS, source: 'demo', status: 'demo' };
  }
  if (isError) {
    return { ingredients: DEMO_INGREDIENTS, source: 'demo', status: 'fallback' };
  }
  if (rows === undefined) {
    // Pro, fetching — show a loading state, never a demo flash.
    return { ingredients: [], source: 'pi_base', status: 'loading' };
  }
  const mapped = rows.map(ingredientRowToEngineIngredient);
  if (mapped.length === 0) {
    // RLS returned nothing / not seeded / backend unavailable.
    return { ingredients: DEMO_INGREDIENTS, source: 'demo', status: 'fallback' };
  }
  return { ingredients: mapped, source: 'pi_base', status: 'ready' };
}

/** Case-insensitive filter over display name, id and category. */
export function filterIngredients(
  ingredients: readonly EngineIngredient[],
  rawQuery: string,
): readonly EngineIngredient[] {
  const q = rawQuery.trim().toLowerCase();
  if (q === '') return ingredients;
  return ingredients.filter((i) =>
    `${i.name} ${i.id} ${i.category}`.toLowerCase().includes(q),
  );
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
