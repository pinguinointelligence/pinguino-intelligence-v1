import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useDebouncedValue } from '@/features/ingredient-builder/useIngredientSearch';
import {
  DEFAULT_CATALOG_MARKET_PREFERENCES,
  getCatalogMarketPreferences,
  listCatalogFavorites,
  listCatalogRecent,
  listCurrentMapperCatalogFavorites,
  listCurrentMapperCatalogRecent,
  searchProducts,
  setCatalogFavorite,
  setCurrentMapperCatalogFavorite,
} from '@/services/globalCatalog';
import {
  CURRENT_MAPPER_CATALOG_CACHE_KEY,
  filterCurrentMapperCatalogHits,
  filterCurrentMapperCatalogRelations,
} from '@/features/ingredient-builder/mapperOnlyCatalog';
import type { CatalogMarketPreferences, CatalogProductSearchHit } from './contracts';

export function resolveCatalogMarketScope(input: {
  forceGlobal: boolean;
  hasSelectedMarkets: boolean;
  defaultScope: CatalogMarketPreferences['defaultScope'];
}): 'global' | 'strict_market' | 'my_markets_and_global' {
  if (input.forceGlobal || (!input.hasSelectedMarkets && input.defaultScope === 'global')) {
    return 'global';
  }
  if (input.hasSelectedMarkets || input.defaultScope === 'my_markets') return 'strict_market';
  return 'my_markets_and_global';
}

export interface GlobalCatalogPickerState {
  hits: CatalogProductSearchHit[];
  favorites: ReadonlySet<string>;
  recent: ReadonlySet<string>;
  preferences: CatalogMarketPreferences;
  isSettled: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  loadMore: () => void;
  toggleFavorite: (entityKind: 'pi_base' | 'commercial_product', id: string, next: boolean) => void;
}

export function useGlobalCatalogPicker(input: {
  enabled: boolean;
  query: string;
  favoritesOnly: boolean;
  context: 'BASE' | 'TOPPING';
  productProfile?: string | null;
  selectedMarkets: readonly string[];
  forceGlobal?: boolean;
  limit?: number;
  /** Recipe ingredient/topping catalog: current Mapper identities only. */
  mapperOnly?: boolean;
}): GlobalCatalogPickerState {
  const queryClient = useQueryClient();
  const settledQuery = useDebouncedValue(input.query, 250);
  const preferences = useQuery({
    queryKey: ['global-catalog-market-preferences'],
    queryFn: getCatalogMarketPreferences,
    enabled: input.enabled,
    staleTime: 5 * 60 * 1000,
  });
  const favorites = useQuery({
    queryKey: [
      'global-catalog-favorites',
      input.mapperOnly ? CURRENT_MAPPER_CATALOG_CACHE_KEY : 'all-products',
    ],
    queryFn: input.mapperOnly ? listCurrentMapperCatalogFavorites : listCatalogFavorites,
    enabled: input.enabled,
    staleTime: 15_000,
  });
  const recent = useQuery({
    queryKey: [
      'global-catalog-recent',
      input.mapperOnly ? CURRENT_MAPPER_CATALOG_CACHE_KEY : 'all-products',
    ],
    queryFn: input.mapperOnly ? listCurrentMapperCatalogRecent : listCatalogRecent,
    enabled: input.enabled,
    staleTime: 15_000,
  });
  const resolvedPreferences = preferences.data ?? DEFAULT_CATALOG_MARKET_PREFERENCES;
  const preferredMarkets = [resolvedPreferences.primaryMarket, ...resolvedPreferences.additionalMarkets]
    .filter((value): value is string => Boolean(value));
  const effectiveMarkets = input.forceGlobal
    ? []
    : input.selectedMarkets.length > 0
      ? [...input.selectedMarkets]
      : preferredMarkets;
  const marketScope = resolveCatalogMarketScope({
    forceGlobal: input.forceGlobal === true,
    hasSelectedMarkets: input.selectedMarkets.length > 0,
    defaultScope: resolvedPreferences.defaultScope,
  });
  const pageSize = Math.min(500, Math.max(1, input.limit ?? 100));
  const pageSignature = [input.mapperOnly ? CURRENT_MAPPER_CATALOG_CACHE_KEY : 'all-products',
    settledQuery, input.context, input.productProfile ?? '', marketScope,
    [...effectiveMarkets].sort().join(','), input.favoritesOnly].join('|');
  const [pagination, setPagination] = useState<{ signature: string; limit: number } | null>(null);
  const requestedLimit = pagination?.signature === pageSignature ? pagination.limit : pageSize;
  const search = useQuery({
    queryKey: ['product-search-v1', pageSignature, requestedLimit],
    queryFn: async () => {
      const wanted = requestedLimit + 1;
      const rows: CatalogProductSearchHit[] = [];
      let cursor = 0;
      while (rows.length < wanted) {
        const batchLimit = Math.min(500, wanted - rows.length);
        const batch = await searchProducts({
          query: settledQuery,
          context: input.context,
          marketScope,
          selectedMarkets: effectiveMarkets,
          favoritesOnly: input.favoritesOnly,
          productProfile: input.productProfile,
          entityKind: input.mapperOnly ? 'pi_base' : null,
          limit: batchLimit,
          cursor,
        });
        cursor += batch.length;
        rows.push(...(input.mapperOnly
          ? filterCurrentMapperCatalogHits(batch, input.context)
          : batch));
        if (batch.length < batchLimit) break;
      }
      return rows;
    },
    enabled: input.enabled,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
  const favoritesQueryKey = [
    'global-catalog-favorites',
    input.mapperOnly ? CURRENT_MAPPER_CATALOG_CACHE_KEY : 'all-products',
  ] as const;
  const mutation = useMutation({
    mutationFn: (args: { entityKind: 'pi_base' | 'commercial_product'; id: string; next: boolean }) =>
      input.mapperOnly
        ? args.entityKind === 'pi_base'
          ? setCurrentMapperCatalogFavorite({ id: args.id, favorite: args.next })
          : Promise.reject(new Error('Only current Mapper products can be favorited here.'))
        : setCatalogFavorite({ entityKind: args.entityKind, id: args.id, favorite: args.next }),
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: favoritesQueryKey });
      const previous = queryClient.getQueryData<Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>>(favoritesQueryKey) ?? [];
      queryClient.setQueryData(
        favoritesQueryKey,
        args.next
          ? [...previous.filter((item) => !(item.entityKind === args.entityKind && item.id === args.id)), { entityKind: args.entityKind, id: args.id }]
          : previous.filter((item) => !(item.entityKind === args.entityKind && item.id === args.id)),
      );
      return { previous };
    },
    onError: (_error, _args, context) => {
      if (context?.previous) queryClient.setQueryData(favoritesQueryKey, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
      void queryClient.invalidateQueries({ queryKey: ['product-search-v1'] });
    },
  });
  const accessibleMapperIds = new Set(
    (search.data ?? []).flatMap((hit) => hit.mappedIngredientId ? [hit.mappedIngredientId] : []),
  );
  const favoriteRelations = input.mapperOnly
    ? filterCurrentMapperCatalogRelations(favorites.data ?? [], accessibleMapperIds)
    : (favorites.data ?? []);
  const recentRelations = input.mapperOnly
    ? filterCurrentMapperCatalogRelations(recent.data ?? [], accessibleMapperIds)
    : (recent.data ?? []);
  const favoriteKeys = new Set(favoriteRelations.map((item) => `${item.entityKind}:${item.id}`));
  const recentKeys = new Set(recentRelations.map((item) => `${item.entityKind}:${item.id}`));
  return {
    hits: (search.data ?? []).slice(0, requestedLimit).map((hit) => ({
      ...hit,
      // Once the private favourites query has settled it is the sole truth. An
      // optimistic UNSTAR must not be undone by a stale favourite bit embedded
      // in the previous search response.
      favorite: favorites.isSuccess
        ? favoriteKeys.has(`${hit.entityKind}:${hit.entityKind === 'pi_base' ? hit.mappedIngredientId : hit.id}`)
        : hit.favorite,
    })),
    favorites: favoriteKeys,
    recent: recentKeys,
    preferences: resolvedPreferences,
    isSettled: settledQuery === input.query && !search.isFetching,
    isFetching: search.isFetching,
    isError: search.isError,
    hasMore: (search.data?.length ?? 0) > requestedLimit,
    loadMore: () => setPagination({ signature: pageSignature, limit: requestedLimit + pageSize }),
    toggleFavorite: (entityKind, id, next) => mutation.mutate({ entityKind, id, next }),
  };
}
