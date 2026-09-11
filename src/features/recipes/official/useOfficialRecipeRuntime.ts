import { useEffect, useState } from 'react';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { getCatalogMarketPreferences, resolveCountryProductsForSlots } from '@/services/globalCatalog';
import { listIngredientsByIds } from '@/services/ingredients';

type ResolvedCountryProduct = Awaited<ReturnType<typeof resolveCountryProductsForSlots>>[number];

export type RuntimeLookup<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'unavailable' };

/** Stable dependency key for a PI list. */
const keyOf = (ids: readonly string[]) => [...new Set(ids)].sort().join('|');

/**
 * One async lookup per PI set. The answer is stored with the key it answers,
 * so a newer key reads as `loading` until its own answer arrives — no state is
 * written synchronously inside the effect.
 */
function useKeyedLookup<T>(
  key: string,
  enabled: boolean,
  load: (ids: string[]) => Promise<T>,
): RuntimeLookup<T> {
  const [answer, setAnswer] = useState<{ key: string; lookup: RuntimeLookup<T> } | null>(null);
  useEffect(() => {
    if (!enabled || key === '') return;
    let cancelled = false;
    load(key.split('|'))
      .then((value) => {
        if (!cancelled) setAnswer({ key, lookup: { status: 'ready', value } });
      })
      .catch(() => {
        if (!cancelled) setAnswer({ key, lookup: { status: 'unavailable' } });
      });
    return () => {
      cancelled = true;
    };
    // `load` is a module-level function per caller; the key alone identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  if (!enabled || key === '') return { status: 'idle' };
  return answer?.key === key ? answer.lookup : { status: 'loading' };
}

const loadMapperRows = async (ids: string[]): Promise<ReadonlyMap<string, IngredientRow>> =>
  new Map((await listIngredientsByIds(ids)).map((row) => [row.ingredient_id, row]));

/**
 * Current canonical Mapper rows for a recipe's PIs, from the one Mapper
 * runtime authority. The recipe never supplies a name of its own: whatever the
 * Mapper currently says about PI-ING-000236 is what the customer reads.
 */
export function useCurrentMapperRows(
  mapperIngredientIds: readonly string[],
  enabled: boolean,
): RuntimeLookup<ReadonlyMap<string, IngredientRow>> {
  return useKeyedLookup(keyOf(mapperIngredientIds), enabled, loadMapperRows);
}

export interface MarketProducts {
  readonly country: string | null;
  readonly byPi: ReadonlyMap<string, ResolvedCountryProduct>;
}

const loadMarketProducts = async (ids: string[]): Promise<MarketProducts> => {
  const country = (await getCatalogMarketPreferences()).primaryMarket;
  const routes = await resolveCountryProductsForSlots({
    mapperIngredientIds: ids,
    productCountry: country,
  });
  return {
    country: routes[0]?.country ?? country,
    byPi: new Map(
      routes
        .filter((route) => route.product.mappedIngredientId === route.mapperIngredientId)
        .map((route) => [route.mapperIngredientId, route]),
    ),
  };
};

/**
 * Exact market products for the recipe's PIs, from the existing country
 * resolver (user preference > country default > safe fallback). A PI with no
 * route simply has no entry: nothing similar is ever proposed here.
 */
export function useMarketProducts(
  mapperIngredientIds: readonly string[],
  enabled: boolean,
): RuntimeLookup<MarketProducts> {
  return useKeyedLookup(keyOf(mapperIngredientIds), enabled, loadMarketProducts);
}
