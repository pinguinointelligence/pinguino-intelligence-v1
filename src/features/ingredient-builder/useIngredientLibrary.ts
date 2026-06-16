/**
 * Hook the Advanced Studio builder uses to get its ingredient list. Vendor-free:
 * it reads access state, calls the read-only ingredients service through the
 * existing service boundary, and hands the rows to the pure selector. The query
 * is enabled only for PI Pro members off the demo route, so /demo never fetches
 * the PI Base library.
 */
import { useQuery } from '@tanstack/react-query';
import { useAccess } from '@/access/useAccess';
import { listApprovedMinus11Ingredients } from '@/services/ingredients';
import {
  selectIngredientLibrary,
  shouldFetchLibrary,
  type IngredientLibrary,
} from './ingredientLibrary';

const KEY = ['pi-base-ingredients'] as const;

export function useIngredientLibrary({ demo }: { demo: boolean }): IngredientLibrary {
  const { isPro } = useAccess();
  const enabled = shouldFetchLibrary({ isPro, demo });

  const query = useQuery({
    queryKey: KEY,
    queryFn: listApprovedMinus11Ingredients,
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  return selectIngredientLibrary({
    demo,
    isPro,
    rows: query.data,
    isError: query.isError,
  });
}
