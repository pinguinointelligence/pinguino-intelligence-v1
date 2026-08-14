/**
 * PI Base ingredients service (Phase Ingredients 1, Slice 2) — the ONLY data
 * access for the ingredients table.
 *
 * READ-ONLY by design: no insert/update/upsert/delete. The full library is
 * gated to PI Pro members by RLS (server-side), and the client sends only the
 * anon key + the user's JWT — never a privileged server key. Rows come back raw;
 * the pure `data/ingredients/ingredientMapper` turns them into EngineIngredients.
 * Returns empty/null gracefully when the backend is not configured.
 */
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import {
  buildSearchTermGroups,
  SEARCHABLE_DB_FIELDS,
} from '@/features/ingredient-builder/ingredientSearch';

const TABLE = 'mapper_basement';
const AUTHENTICATED_SELECTION_VIEW = 'mapper_basement_search';

/** Whether the PI Base backend is configured (the live search path exists). */
export function isIngredientBackendConfigured(): boolean {
  return supabase !== null;
}

/** Active ingredients (RLS still scopes visibility to PI Pro members). */
export async function listActiveIngredients(): Promise<IngredientRow[]> {
  if (!supabase) return emptyUnconfiguredRead('ingredients.listActiveIngredients', []);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_active', true)
    .order('ingredient_name_display', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientRow[];
}

/** Active ingredients approved for the PI recipe engines. */
export async function listEngineApprovedIngredients(): Promise<IngredientRow[]> {
  if (!supabase) return emptyUnconfiguredRead('ingredients.listEngineApprovedIngredients', []);
  const rows: IngredientRow[] = [];
  for (let offset = 0; ; offset += SEARCH_DB_PAGE_ROWS) {
    const { data, error } = await supabase
      .from(AUTHENTICATED_SELECTION_VIEW)
      .select('*')
      .eq('approved_for_engines', true)
      .order('ingredient_name_display', { ascending: true })
      .order('ingredient_id', { ascending: true })
      .range(offset, offset + SEARCH_DB_PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as IngredientRow[];
    rows.push(...page);
    if (page.length < SEARCH_DB_PAGE_ROWS) break;
  }
  return rows;
}

/**
 * LIVE server-side catalogue search (owner P0 — the picker must never depend on
 * a preloaded snapshot). Every settled query hits the CURRENT backend with a
 * per-token AND of alias-term ORs over the safe text columns, capped to a small
 * candidate page. The 1,000-row PostgREST default can never truncate results
 * because every filtered candidate set is far below the cap.
 *
 * SAFE PAYLOAD: only identity/name/category/form columns — never PAC/POD or
 * composition. The full approved scientific row is resolved on SELECTION by
 * exact stable id through `getIngredientById` (RLS-guarded).
 */
export interface IngredientSearchRow {
  ingredient_id: string;
  ingredient_name_display: string;
  ingredient_name_internal: string;
  /** Optional compatibility field for injected/test rows. The sanctioned
   * authenticated view does not expose a brand column. */
  brand?: string | null;
  ingredient_category: string;
  ingredient_subcategory: string | null;
}

export const SEARCH_RESULT_COLUMNS =
  'ingredient_id,ingredient_name_display,ingredient_name_internal,ingredient_category,ingredient_subcategory';

/** Rows fetched per `.range` window — strictly below the PostgREST `max-rows`
 * cap (1,000 on Supabase), so no single request can ever be silently truncated
 * even when `Pokaż więcej wyników` grows the client window past 1,000 rows. */
export const SEARCH_DB_PAGE_ROWS = 500;

export async function searchEngineApprovedIngredients(
  rawQuery: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<IngredientSearchRow[]> {
  if (!supabase) return emptyUnconfiguredRead('ingredients.searchEngineApprovedIngredients', []);
  const groups = buildSearchTermGroups(rawQuery);
  if (groups.length === 0) return [];
  const limit = options?.limit ?? 200;

  // Explicit `.range` paging (deterministic order: display name + stable id
  // tiebreak) in windows below the PostgREST cap. A short window = end of the
  // result set; otherwise keep paging until the requested client limit.
  const rows: IngredientSearchRow[] = [];
  for (let offset = 0; offset < limit; ) {
    const to = Math.min(offset + SEARCH_DB_PAGE_ROWS, limit) - 1;
    let query = supabase
      .from(AUTHENTICATED_SELECTION_VIEW)
      .select(SEARCH_RESULT_COLUMNS)
      .eq('approved_for_base', true)
      .eq('approved_for_engines', true)
      .ilike('verification_status', 'Verified%');
    // One AND-group per token; OR across (alias term × safe column) within it.
    for (const terms of groups) {
      query = query.or(
        terms.flatMap((t) => SEARCHABLE_DB_FIELDS.map((f) => `${f}.ilike.*${t}*`)).join(','),
      );
    }
    query = query
      .order('ingredient_name_display', { ascending: true })
      .order('ingredient_id', { ascending: true })
      .range(offset, to);
    if (options?.signal) query = query.abortSignal(options.signal);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as IngredientSearchRow[];
    rows.push(...page);
    if (page.length < to - offset + 1) break; // short page — no more rows exist
    offset = to + 1;
  }
  return rows;
}

/** Reference rows for a known id set (the "My Products" linkage — small, exact). */
export async function listIngredientsByIds(ids: readonly string[]): Promise<IngredientRow[]> {
  if (ids.length === 0) return []; // honest empty: nothing was asked for
  if (!supabase) return emptyUnconfiguredRead('ingredients.listIngredientsByIds', []);
  const { data, error } = await supabase
    .from(AUTHENTICATED_SELECTION_VIEW)
    .select('*')
    .in('ingredient_id', [...ids]);
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientRow[];
}

/** Exact-id list with the same current trust gate as Base selection. Used for
 * private Favorites/Recent so a later Mapper revocation disappears immediately. */
export async function listEngineApprovedIngredientsByIds(ids: readonly string[]): Promise<IngredientRow[]> {
  if (ids.length === 0) return [];
  if (!supabase) return emptyUnconfiguredRead('ingredients.listEngineApprovedIngredientsByIds', []);
  const { data, error } = await supabase
    .from(AUTHENTICATED_SELECTION_VIEW)
    .select('*')
    .in('ingredient_id', [...ids])
    .eq('approved_for_base', true)
    .eq('approved_for_engines', true)
    .ilike('verification_status', 'Verified%');
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientRow[];
}

/** A single ingredient by its stable id (RLS still applies). */
export async function getIngredientById(id: string): Promise<IngredientRow | null> {
  if (!supabase) return emptyUnconfiguredRead('ingredients.getIngredientById', null);
  const { data, error } = await supabase
    .from(AUTHENTICATED_SELECTION_VIEW)
    .select('*')
    .eq('ingredient_id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IngredientRow | null) ?? null;
}

/** Selection-time trust gate for catalog-to-Base mapping. Search results can
 * become stale; this rechecks every current Mapper eligibility flag at click. */
export async function getEngineApprovedIngredientById(id: string): Promise<IngredientRow | null> {
  if (!supabase) return emptyUnconfiguredRead('ingredients.getEngineApprovedIngredientById', null);
  const { data, error } = await supabase
    .from(AUTHENTICATED_SELECTION_VIEW)
    .select('*')
    .eq('ingredient_id', id)
    .eq('approved_for_base', true)
    .eq('approved_for_engines', true)
    .ilike('verification_status', 'Verified%')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IngredientRow | null) ?? null;
}
