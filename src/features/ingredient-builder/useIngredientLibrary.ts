/**
 * Hook the canonical Pro builder uses for its ingredient context. Owner P0
 * (live complete Mapper search): the Pro path NO LONGER preloads the catalogue —
 * the old one-time full-list call was capped by PostgREST at 1,000 of 2,070
 * alphabetical rows (everything after „LACTOSE …" was invisible: MILK 3.5 %,
 * WHOLE MILK, PINEAPPLE/STRAWBERRIES Fresh Fruit). Searching now hits the live
 * backend per settled query (`useIngredientSearch`).
 *
 * The "My Products" group still loads: confirmed products + ONLY their exact
 * matched reference rows (`listIngredientsByIds` — a handful, never the
 * catalogue). Demo / non-Pro keep the local 12-ingredient preview catalog and
 * never fetch PI Base.
 */
import { useQuery } from '@tanstack/react-query';
import { useAccess } from '@/access/useAccess';
import { isIngredientBackendConfigured, listIngredientsByIds } from '@/services/ingredients';
import { listMyProducts } from '@/services/products';
import { buildProductEngineLibrary } from '@/data/products/productEngineLibrary';
import {
  selectIngredientLibrary,
  serverSearchLibrary,
  shouldFetchLibrary,
  type IngredientLibrary,
} from './ingredientLibrary';

const PRODUCTS_KEY = ['my-products'] as const;

export function useIngredientLibrary({ demo }: { demo: boolean }): IngredientLibrary {
  const { isPro } = useAccess();
  const enabled = shouldFetchLibrary({ isPro, demo });

  const productsQuery = useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: listMyProducts,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const matchedIds = [
    ...new Set(
      (productsQuery.data ?? [])
        .map((product) => product.matched_basement_id)
        .filter((id): id is string => typeof id === 'string' && id !== ''),
    ),
  ].sort();
  const referencesQuery = useQuery({
    queryKey: ['product-reference-rows', matchedIds.join(',')],
    queryFn: () => listIngredientsByIds(matchedIds),
    enabled: enabled && matchedIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const base = !enabled
    ? selectIngredientLibrary({ demo, isPro, rows: undefined, isError: false }) // demo / non-Pro preview catalog
    : isIngredientBackendConfigured()
      ? serverSearchLibrary() // canonical Pro: live per-query backend search
      : selectIngredientLibrary({ demo, isPro, rows: [], isError: false }); // backend not configured → honest fallback

  const referenceById = new Map((referencesQuery.data ?? []).map((r) => [r.ingredient_id, r]));
  const productLib = buildProductEngineLibrary({ products: productsQuery.data ?? [], referenceById });

  return { ...base, products: productLib.ingredients, productProvenance: productLib.provenance };
}
