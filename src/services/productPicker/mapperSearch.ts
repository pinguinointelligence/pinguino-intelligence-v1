/**
 * PINGÜINO Track F — live Mapper catalogue SEARCH service (server-side search).
 *
 * Two read models, two trust levels:
 *
 *   • `mapper_basement_search_demo` (0033) — the DEMO-SAFE view every visitor
 *     (anon included) may search. Its row type is a CLOSED interface mirroring
 *     the 0033 field list: identity, category, dietary flags, approval booleans,
 *     dataset version. NO pac/pod, NO composition, NO confidence, NO EAN ever
 *     crosses this contract — `toSafeMapperSearchRow` strips anything extra at
 *     runtime, and the select list is explicit (never `*`).
 *   • `mapper_basement_search` (0032) — the RICH view (authenticated only) read
 *     AFTER a selection to resolve the engine values (pac/pod) the readiness
 *     gate needs. An anonymous session gets a typed 'unauthorized' result —
 *     never a thrown error, never invented values.
 *
 * Owner decision (2026-07-18): searching the catalogue is NOT gated by a paid
 * subscription — this module deliberately performs no subscription/entitlement
 * check. Exact grams stay gated elsewhere. Read-only: nothing here can write.
 */
import * as backend from '@/lib/supabase/client';
import type { ReferenceEngineValues } from '@/data/products/productEngineResolver';

/** The demo-safe view (0033) — searchable by anon AND authenticated. */
export const DEMO_SEARCH_VIEW = 'mapper_basement_search_demo';
/** The rich view (0032) — engine values, authenticated only. */
export const RICH_SEARCH_VIEW = 'mapper_basement_search';

/** Default page size for incremental loading. */
export const MAPPER_SEARCH_DEFAULT_LIMIT = 20;

/**
 * The CLOSED demo-safe column list (exactly the 0033 view). Never widened to `*`;
 * any change here must go through a matching migration + contract-test change.
 */
export const MAPPER_SEARCH_COLUMNS = [
  'ingredient_id',
  'ingredient_name_display',
  'ingredient_name_internal',
  'ingredient_category',
  'ingredient_subcategory',
  'vegan',
  'dairy_free',
  'gluten_free',
  'contains_alcohol',
  'approved_for_base',
  'approved_for_engines',
  'dataset_version',
] as const;

type MapperSearchColumn = (typeof MAPPER_SEARCH_COLUMNS)[number];

/** Tri-state dietary flag as stored ('true' / 'false' / 'unknown') — honest unknowns. */
export type DietFlag = string | null;

/**
 * One demo-safe search row. A CLOSED interface: it has no pac/pod, no composition,
 * no confidence, no EAN — and can never grow one without the 0033 contract moving.
 */
export interface SafeMapperSearchRow {
  ingredient_id: string;
  ingredient_name_display: string;
  ingredient_name_internal: string | null;
  ingredient_category: string | null;
  ingredient_subcategory: string | null;
  vegan: DietFlag;
  dairy_free: DietFlag;
  gluten_free: DietFlag;
  contains_alcohol: DietFlag;
  approved_for_base: boolean | null;
  approved_for_engines: boolean | null;
  dataset_version: string | null;
}

/** Why the live catalogue cannot answer right now (honest, enumerable). */
export type CatalogueUnavailableReason = 'not_configured' | 'view_missing';

export type MapperSearchOutcome =
  | { kind: 'results'; rows: SafeMapperSearchRow[]; hasMore: boolean }
  | { kind: 'unavailable'; reason: CatalogueUnavailableReason }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string };

export interface MapperSearchQuery {
  text: string;
  category?: string | null;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/* ------------------------------------------------------------------------ *
 * Pure helpers (exported for tests)                                         *
 * ------------------------------------------------------------------------ */

/** Escape LIKE metacharacters in user text so `%`/`_`/`\` match literally. */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Build the PostgREST `or=` filter string matching user text against several
 * columns with a case-insensitive contains. The pattern is double-quoted (with
 * `\`/`"` escaped) so commas/parens in user text cannot break the filter tree.
 */
export function ilikeOrFilter(columns: readonly string[], text: string): string {
  const pattern = `%${escapeLikePattern(text)}%`;
  const quoted = `"${pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return columns.map((c) => `${c}.ilike.${quoted}`).join(',');
}

/**
 * Runtime enforcement of the closed contract: pick EXACTLY the safe columns off a
 * raw row and drop everything else. Even a widened view could not push an engine
 * value or composition percentage through this function.
 */
export function toSafeMapperSearchRow(raw: Record<string, unknown>): SafeMapperSearchRow {
  const out = {} as Record<MapperSearchColumn, unknown>;
  for (const col of MAPPER_SEARCH_COLUMNS) out[col] = raw[col] ?? null;
  return out as unknown as SafeMapperSearchRow;
}

/** PostgREST error shape (structural — no client types leak out of this module). */
interface QueryError {
  code?: string | null;
  message?: string | null;
}

/** True when the error means the read model has not been applied yet. */
function isViewMissing(error: QueryError): boolean {
  // 42P01 = undefined_table; PGRST205 = not in the schema cache (view not applied).
  return error.code === '42P01' || error.code === 'PGRST205';
}

/** True when the error means this session may not read the view (anon vs 0032). */
function isUnauthorized(error: QueryError): boolean {
  // 42501 = insufficient_privilege; PGRST301 = JWT problems.
  return error.code === '42501' || error.code === 'PGRST301';
}

/** True when the failure is the caller's own cancellation. */
function isAborted(error: QueryError, signal?: AbortSignal): boolean {
  return signal?.aborted === true || /abort/i.test(error.message ?? '');
}

/* ------------------------------------------------------------------------ *
 * Search (demo-safe view — no subscription check, by owner decision)        *
 * ------------------------------------------------------------------------ */

/**
 * Search the demo-safe Mapper view by display/internal name (server-side ilike),
 * optionally narrowed to a category, ordered by display name, paged via
 * limit/offset for incremental loading. Fetches limit+1 rows to report `hasMore`
 * honestly. Never throws for expected failures — returns a typed outcome.
 */
export async function searchMapperIngredients(query: MapperSearchQuery): Promise<MapperSearchOutcome> {
  const client = backend.supabase;
  if (!client) return { kind: 'unavailable', reason: 'not_configured' };

  const limit = query.limit ?? MAPPER_SEARCH_DEFAULT_LIMIT;
  const offset = query.offset ?? 0;
  const text = query.text.trim();

  let builder = client.from(DEMO_SEARCH_VIEW).select(MAPPER_SEARCH_COLUMNS.join(','));
  if (text !== '') {
    builder = builder.or(ilikeOrFilter(['ingredient_name_display', 'ingredient_name_internal'], text));
  }
  if (query.category) {
    builder = builder.eq('ingredient_category', query.category);
  }
  builder = builder
    .order('ingredient_name_display', { ascending: true })
    .range(offset, offset + limit); // limit+1 rows → an honest hasMore

  if (query.signal) builder = builder.abortSignal(query.signal);

  const { data, error } = await builder;
  if (error) {
    if (isAborted(error, query.signal)) return { kind: 'aborted' };
    if (isViewMissing(error)) return { kind: 'unavailable', reason: 'view_missing' };
    return { kind: 'error', message: error.message ?? 'search failed' };
  }

  const raw = (data ?? []) as Record<string, unknown>[];
  const hasMore = raw.length > limit;
  return {
    kind: 'results',
    rows: raw.slice(0, limit).map(toSafeMapperSearchRow),
    hasMore,
  };
}

/* ------------------------------------------------------------------------ *
 * Post-selection engine values (rich view — authenticated only)             *
 * ------------------------------------------------------------------------ */

export type EngineValuesOutcome =
  | { kind: 'values'; reference: ReferenceEngineValues }
  | { kind: 'not_found' }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable'; reason: CatalogueUnavailableReason }
  | { kind: 'aborted' }
  | { kind: 'error'; message: string };

/**
 * Read the RICH read model (0032) for ONE selected ingredient to obtain the
 * engine values (pac/pod) the reused readiness gate consumes. Works only for an
 * authenticated session — an anonymous one gets a typed 'unauthorized' outcome
 * (the UI then says honestly that exact engine values require signing in).
 * Never throws for expected failures; never invents a value.
 */
export async function fetchIngredientEngineValues(
  ingredientId: string,
  signal?: AbortSignal,
): Promise<EngineValuesOutcome> {
  const client = backend.supabase;
  if (!client) return { kind: 'unavailable', reason: 'not_configured' };

  let builder = client
    .from(RICH_SEARCH_VIEW)
    .select('ingredient_id,ingredient_name_display,pac_value,pod_value')
    .eq('ingredient_id', ingredientId);
  if (signal) builder = builder.abortSignal(signal);

  const { data, error } = await builder.maybeSingle();
  if (error) {
    if (isAborted(error, signal)) return { kind: 'aborted' };
    if (isUnauthorized(error)) return { kind: 'unauthorized' };
    if (isViewMissing(error)) return { kind: 'unavailable', reason: 'view_missing' };
    return { kind: 'error', message: error.message ?? 'engine values fetch failed' };
  }
  if (!data) return { kind: 'not_found' };

  const row = data as Record<string, unknown>;
  return {
    kind: 'values',
    reference: {
      ingredient_id: (row.ingredient_id as string | null) ?? null,
      ingredient_name_display: (row.ingredient_name_display as string | null) ?? null,
      pac_value: (row.pac_value as number | string | null) ?? null,
      pod_value: (row.pod_value as number | string | null) ?? null,
    },
  };
}
