/**
 * LIVE server-side ingredient search (owner P0). Every settled (debounced,
 * normalized) query is its own react-query entry that hits the CURRENT backend:
 *  - queryKey = [prefix, normalizedQuery, limit] → an old response can never
 *    overwrite a newer query (different key), and react-query aborts the
 *    in-flight request on key change (the AbortSignal reaches PostgREST);
 *  - staleTime is SHORT (15 s) + refetchOnMount 'always' → reopening the picker
 *    or re-typing a query after backend data changed refetches — a record added
 *    mid-session appears without redeploy, re-login or any manual cache reset;
 *  - no full-catalogue snapshot anywhere: an empty query fetches NOTHING.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  searchEngineApprovedIngredients,
  type IngredientSearchRow,
} from '@/services/ingredients';
import {
  normalizeSearchText,
  rankSearchHits,
  type IngredientSearchHit,
} from './ingredientSearch';

export const SEARCH_DEBOUNCE_MS = 250;
/** First page must cover real concept candidate sets whole (largest verified
 * family: „milk" = 95 rows) so client ranking sees every candidate — the page
 * is server-ordered alphabetically, and a natural-first hit (WHOLE MILK, W…)
 * must never fall off the page before ranking. Payload stays tiny (6 columns). */
export const SEARCH_PAGE_SIZE = 200;
/** Freshness contract: short cache only — never a session-long snapshot. */
export const SEARCH_STALE_TIME_MS = 15_000;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Search hit shaped for ranking + rendering (safe fields only). */
export interface RankedSearchHit extends IngredientSearchHit {
  internal: string;
}

export const toSearchHit = (row: IngredientSearchRow): RankedSearchHit => ({
  id: row.ingredient_id,
  name: row.ingredient_name_display.trim() || row.ingredient_name_internal,
  // Semantic text = display + internal + FORM („skimmed milk powder" must reach
  // the SKIMMED MILK row whose subcategory is skimmed_milk_powder) — never brand/SKU.
  nameNorm: normalizeSearchText(
    `${row.ingredient_name_display} ${row.ingredient_name_internal} ${row.ingredient_subcategory ?? ''}`,
  ),
  category: row.ingredient_category,
  form: row.ingredient_subcategory ?? '',
  internal: row.ingredient_name_internal,
});

export interface IngredientSearchState {
  /** Ranked hits for the CURRENT settled query (natural/basic forms first). */
  hits: RankedSearchHit[];
  /** The settled normalized query the hits belong to. */
  settledNorm: string;
  /** Input has settled (debounce done) AND the response for it is in. */
  isSettled: boolean;
  isFetching: boolean;
  isError: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useIngredientSearch({
  enabled,
  query,
}: {
  enabled: boolean;
  query: string;
}): IngredientSearchState {
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const norm = normalizeSearchText(debounced);
  // Pagination is stored WITH the query it belongs to — a new settled query
  // automatically starts back at page one (derived state, no reset effect).
  const [pagination, setPagination] = useState<{ norm: string; limit: number } | null>(null);
  const limit = pagination?.norm === norm ? pagination.limit : SEARCH_PAGE_SIZE;

  const result = useQuery({
    queryKey: ['ingredient-search', norm, limit],
    enabled: enabled && norm !== '',
    queryFn: ({ signal }) => searchEngineApprovedIngredients(debounced, { limit, signal }),
    staleTime: SEARCH_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  const hits = useMemo(
    () => rankSearchHits((result.data ?? []).map(toSearchHit), debounced),
    [result.data, debounced],
  );

  return {
    hits,
    settledNorm: norm,
    isSettled: normalizeSearchText(query) === norm && !result.isFetching,
    isFetching: result.isFetching,
    isError: result.isError,
    hasMore: (result.data?.length ?? 0) >= limit,
    loadMore: () => setPagination({ norm, limit: limit + SEARCH_PAGE_SIZE }),
  };
}
