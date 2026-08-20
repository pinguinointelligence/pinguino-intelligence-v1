/**
 * Hook the canonical Pro builder uses for its ingredient context. Owner P0
 * (live complete Mapper search): the Pro path NO LONGER preloads the catalogue —
 * the old one-time full-list call was capped by PostgREST at 1,000 of 2,070
 * alphabetical rows (everything after „LACTOSE …" was invisible: MILK 3.5 %,
 * WHOLE MILK, PINEAPPLE/STRAWBERRIES Fresh Fruit). Searching now hits the live
 * backend per settled query (`useIngredientSearch`).
 *
 * Owner/private products are not a recipe-catalog source. Demo / non-Pro keep
 * the local preview catalog; authenticated Pro uses only current Mapper search.
 */
import { useAccess } from '@/access/useAccess';
import { isIngredientBackendConfigured } from '@/services/ingredients';
import {
  selectIngredientLibrary,
  serverSearchLibrary,
  shouldFetchLibrary,
  type IngredientLibrary,
} from './ingredientLibrary';

export function useIngredientLibrary({ demo }: { demo: boolean }): IngredientLibrary {
  const { isPro } = useAccess();
  const enabled = shouldFetchLibrary({ isPro, demo });

  const base = !enabled
    ? selectIngredientLibrary({ demo, isPro, rows: undefined, isError: false }) // demo / non-Pro preview catalog
    : isIngredientBackendConfigured()
      ? serverSearchLibrary() // canonical Pro: live per-query backend search
      : selectIngredientLibrary({ demo, isPro, rows: [], isError: false }); // backend not configured → honest fallback

  return base;
}
