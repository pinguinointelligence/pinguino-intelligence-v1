/**
 * Hook the Advanced Studio builder uses to get its ingredient list. Vendor-free: it reads
 * access state, calls the read-only ingredients + products services through the existing
 * service boundaries, and hands the rows to the pure selectors. Queries are enabled only for
 * PI Pro members off the demo route, so /demo never fetches PI Base or the owner's products.
 *
 * The "My Products" group is the owner's CONFIRMED products turned into engine ingredients by
 * linking through their matched reference (buildProductEngineLibrary → productEngineHandoff).
 * Product PAC/POD columns stay null; engine values are resolved from the reference at use time.
 */
import { useQuery } from '@tanstack/react-query';
import { useAccess } from '@/access/useAccess';
import { listEngineApprovedIngredients } from '@/services/ingredients';
import { listMyProducts } from '@/services/products';
import { buildProductEngineLibrary } from '@/data/products/productEngineLibrary';
import {
  selectIngredientLibrary,
  shouldFetchLibrary,
  type IngredientLibrary,
} from './ingredientLibrary';

const KEY = ['pi-base-ingredients'] as const;
const PRODUCTS_KEY = ['my-products'] as const;

export function useIngredientLibrary({ demo }: { demo: boolean }): IngredientLibrary {
  const { isPro } = useAccess();
  const enabled = shouldFetchLibrary({ isPro, demo });

  const query = useQuery({
    queryKey: KEY,
    queryFn: listEngineApprovedIngredients,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
  const productsQuery = useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: listMyProducts,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const base = selectIngredientLibrary({
    demo,
    isPro,
    rows: query.data,
    isError: query.isError,
  });

  // Build "My Products" from confirmed products linked to the (already-fetched) reference rows.
  // Empty in demo / non-Pro / before the reference rows load.
  const referenceById = new Map((query.data ?? []).map((r) => [r.ingredient_id, r]));
  const productLib = buildProductEngineLibrary({ products: productsQuery.data ?? [], referenceById });

  return { ...base, products: productLib.ingredients, productProvenance: productLib.provenance };
}
