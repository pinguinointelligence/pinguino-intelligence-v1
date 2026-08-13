import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@/features/ingredient-builder/useIngredientSearch';
import {
  DEFAULT_CATALOG_MARKET_PREFERENCES,
  getCatalogMarketPreferences,
  listCatalogFavorites,
  listCatalogRecent,
  searchGlobalCatalog,
  setCatalogFavorite,
} from '@/services/globalCatalog';
import type { CatalogMarketPreferences, CatalogProductSearchHit } from './contracts';

export interface GlobalCatalogPickerState {
  hits: CatalogProductSearchHit[];
  favorites: ReadonlySet<string>;
  recent: ReadonlySet<string>;
  preferences: CatalogMarketPreferences;
  isSettled: boolean;
  isError: boolean;
  toggleFavorite: (entityKind: 'pi_base' | 'commercial_product', id: string, next: boolean) => void;
}

export function useGlobalCatalogPicker(input: {
  enabled: boolean;
  query: string;
  favoritesOnly: boolean;
  selectedMarkets: readonly string[];
  forceGlobal?: boolean;
  limit?: number;
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
    queryKey: ['global-catalog-favorites'],
    queryFn: listCatalogFavorites,
    enabled: input.enabled,
    staleTime: 15_000,
  });
  const recent = useQuery({
    queryKey: ['global-catalog-recent'],
    queryFn: listCatalogRecent,
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
    : resolvedPreferences.defaultScope === 'my_markets'
      ? preferredMarkets
      : [];
  const search = useQuery({
    queryKey: ['global-catalog-search', settledQuery, [...effectiveMarkets].sort().join(','), input.favoritesOnly, input.limit ?? 100],
    queryFn: () => searchGlobalCatalog({
      query: settledQuery,
      markets: effectiveMarkets,
      favoritesOnly: input.favoritesOnly,
      limit: input.limit ?? 100,
    }),
    enabled: input.enabled,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
  const mutation = useMutation({
    mutationFn: (args: { entityKind: 'pi_base' | 'commercial_product'; id: string; next: boolean }) =>
      setCatalogFavorite({ entityKind: args.entityKind, id: args.id, favorite: args.next }),
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: ['global-catalog-favorites'] });
      const previous = queryClient.getQueryData<Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>>(['global-catalog-favorites']) ?? [];
      queryClient.setQueryData(
        ['global-catalog-favorites'],
        args.next
          ? [...previous.filter((item) => !(item.entityKind === args.entityKind && item.id === args.id)), { entityKind: args.entityKind, id: args.id }]
          : previous.filter((item) => !(item.entityKind === args.entityKind && item.id === args.id)),
      );
      return { previous };
    },
    onError: (_error, _args, context) => {
      if (context?.previous) queryClient.setQueryData(['global-catalog-favorites'], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['global-catalog-favorites'] });
      void queryClient.invalidateQueries({ queryKey: ['global-catalog-search'] });
    },
  });
  const favoriteKeys = new Set((favorites.data ?? []).map((item) => `${item.entityKind}:${item.id}`));
  const recentKeys = new Set((recent.data ?? []).map((item) => `${item.entityKind}:${item.id}`));
  return {
    hits: (search.data ?? []).map((hit) => ({
      ...hit,
      // Once the private favourites query has settled it is the sole truth. An
      // optimistic UNSTAR must not be undone by a stale favourite bit embedded
      // in the previous search response.
      favorite: favorites.isSuccess
        ? favoriteKeys.has(`commercial_product:${hit.id}`)
        : hit.favorite,
    })),
    favorites: favoriteKeys,
    recent: recentKeys,
    preferences: resolvedPreferences,
    isSettled: settledQuery === input.query && !search.isFetching,
    isError: search.isError,
    toggleFavorite: (entityKind, id, next) => mutation.mutate({ entityKind, id, next }),
  };
}
