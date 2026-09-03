import { queryTokenTerms } from '@/features/ingredient-builder/ingredientSearch';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  favoritesSettled: boolean;
  recent: ReadonlySet<string>;
  preferences: CatalogMarketPreferences;
  isSettled: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  loadMore: () => void;
  toggleFavorite: (entityKind: 'pi_base' | 'commercial_product', id: string, next: boolean) => void;
}

interface CatalogSearchPage {
  hits: CatalogProductSearchHit[];
  nextCursor: number | null;
}

const catalogHitIdentity = (hit: CatalogProductSearchHit): string =>
  hit.entityKind === 'pi_base'
    ? `pi_base:${hit.mappedIngredientId ?? hit.id}`
    : `commercial_product:${hit.id}`;

export function mergeCatalogSearchPages(
  pages: readonly CatalogSearchPage[],
): CatalogProductSearchHit[] {
  return [
    ...new Map(
      pages.flatMap((page) => page.hits).map((hit) => [catalogHitIdentity(hit), hit]),
    ).values(),
  ];
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
  const preferredMarkets = [
    resolvedPreferences.primaryMarket,
    ...resolvedPreferences.additionalMarkets,
  ].filter((value): value is string => Boolean(value));
  // Favorites are an account-owned collection, not a market projection. A
  // Polish favorite must remain visible after Poland is disabled in Settings.
  const favoritesIgnoreMarket = input.favoritesOnly;
  const effectiveMarkets =
    input.forceGlobal || favoritesIgnoreMarket
      ? []
      : input.selectedMarkets.length > 0
        ? [...input.selectedMarkets]
        : preferredMarkets;
  const marketScope = resolveCatalogMarketScope({
    forceGlobal: input.forceGlobal === true || favoritesIgnoreMarket,
    hasSelectedMarkets: input.selectedMarkets.length > 0,
    defaultScope: resolvedPreferences.defaultScope,
  });
  const pageSize = Math.min(500, Math.max(1, input.limit ?? 100));
  const pageSignature = [
    input.mapperOnly ? CURRENT_MAPPER_CATALOG_CACHE_KEY : 'all-products',
    settledQuery,
    input.context,
    input.productProfile ?? '',
    marketScope,
    [...effectiveMarkets].sort().join(','),
    input.favoritesOnly,
  ].join('|');
  const search = useInfiniteQuery({
    queryKey: ['product-search-v1', pageSignature],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const batch = await searchProducts({
        query: settledQuery,
        context: input.context,
        marketScope,
        selectedMarkets: effectiveMarkets,
        favoritesOnly: input.favoritesOnly,
        productProfile: input.productProfile,
        entityKind: input.mapperOnly ? 'pi_base' : null,
        tokenGroups: queryTokenTerms(settledQuery),
        limit: pageSize,
        cursor: pageParam,
      });
      return {
        hits: input.mapperOnly ? filterCurrentMapperCatalogHits(batch, input.context) : batch,
        nextCursor: batch.length === pageSize ? pageParam + batch.length : null,
      } satisfies CatalogSearchPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: input.enabled,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });
  const searchHits = mergeCatalogSearchPages(search.data?.pages ?? []);
  const favoritesQueryKey = [
    'global-catalog-favorites',
    input.mapperOnly ? CURRENT_MAPPER_CATALOG_CACHE_KEY : 'all-products',
  ] as const;
  const mutation = useMutation({
    mutationFn: (args: {
      entityKind: 'pi_base' | 'commercial_product';
      id: string;
      next: boolean;
    }) =>
      input.mapperOnly
        ? args.entityKind === 'pi_base'
          ? setCurrentMapperCatalogFavorite({ id: args.id, favorite: args.next })
          : Promise.reject(new Error('Only current Mapper products can be favorited here.'))
        : setCatalogFavorite({ entityKind: args.entityKind, id: args.id, favorite: args.next }),
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: favoritesQueryKey });
      const previous =
        queryClient.getQueryData<
          Array<{ entityKind: 'pi_base' | 'commercial_product'; id: string }>
        >(favoritesQueryKey) ?? [];
      queryClient.setQueryData(
        favoritesQueryKey,
        args.next
          ? [
              ...previous.filter(
                (item) => !(item.entityKind === args.entityKind && item.id === args.id),
              ),
              { entityKind: args.entityKind, id: args.id },
            ]
          : previous.filter(
              (item) => !(item.entityKind === args.entityKind && item.id === args.id),
            ),
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
    searchHits.flatMap((hit) => (hit.mappedIngredientId ? [hit.mappedIngredientId] : [])),
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
    hits: searchHits.map((hit) => ({
      ...hit,
      // Once the private favourites query has settled it is the sole truth. An
      // optimistic UNSTAR must not be undone by a stale favourite bit embedded
      // in the previous search response.
      favorite: favorites.isSuccess
        ? favoriteKeys.has(
            `${hit.entityKind}:${hit.entityKind === 'pi_base' ? hit.mappedIngredientId : hit.id}`,
          )
        : hit.favorite,
    })),
    favorites: favoriteKeys,
    favoritesSettled: favorites.isFetched,
    recent: recentKeys,
    preferences: resolvedPreferences,
    // Fetching the next page must not make already-visible hits stale. A new
    // debounced query is still hidden until its own first page has resolved.
    isSettled: settledQuery === input.query && !search.isPending,
    isFetching: search.isFetching,
    isError: search.isError,
    hasMore: search.hasNextPage,
    loadMore: () => {
      if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
    },
    toggleFavorite: (entityKind, id, next) => mutation.mutate({ entityKind, id, next }),
  };
}
