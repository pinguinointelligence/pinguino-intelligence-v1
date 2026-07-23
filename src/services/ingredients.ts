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
import type { IngredientRow } from '@/data/ingredients/ingredientRow';
import { buildSearchTermGroups, SEARCHABLE_DB_FIELDS } from '@/features/ingredient-builder/ingredientSearch';

const TABLE = 'mapper_basement';

/** Whether the PI Base backend is configured (the live search path exists). */
export function isIngredientBackendConfigured(): boolean {
  return supabase !== null;
}

/** Active ingredients (RLS still scopes visibility to PI Pro members). */
export async function listActiveIngredients(): Promise<IngredientRow[]> {
  if (!supabase) return [];
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
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('is_active', true)
    .eq('approved_for_engines', true)
    .order('ingredient_name_display', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientRow[];
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
  brand: string | null;
  ingredient_category: string;
  ingredient_subcategory: string | null;
}

export const SEARCH_RESULT_COLUMNS =
  'ingredient_id,ingredient_name_display,ingredient_name_internal,brand,ingredient_category,ingredient_subcategory';

export async function searchEngineApprovedIngredients(
  rawQuery: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<IngredientSearchRow[]> {
  if (!supabase) return [];
  const groups = buildSearchTermGroups(rawQuery);
  if (groups.length === 0) return [];

  let query = supabase
    .from(TABLE)
    .select(SEARCH_RESULT_COLUMNS)
    .eq('is_active', true)
    .eq('approved_for_engines', true);
  // One AND-group per token; OR across (alias term × safe column) within it.
  for (const terms of groups) {
    query = query.or(
      terms.flatMap((t) => SEARCHABLE_DB_FIELDS.map((f) => `${f}.ilike.*${t}*`)).join(','),
    );
  }
  query = query
    .order('ingredient_name_display', { ascending: true })
    .order('ingredient_id', { ascending: true })
    .limit(options?.limit ?? 200);
  if (options?.signal) query = query.abortSignal(options.signal);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientSearchRow[];
}

/** Reference rows for a known id set (the "My Products" linkage — small, exact). */
export async function listIngredientsByIds(ids: readonly string[]): Promise<IngredientRow[]> {
  if (!supabase || ids.length === 0) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .in('ingredient_id', [...ids]);
  if (error) throw new Error(error.message);
  return (data ?? []) as IngredientRow[];
}

/** A single ingredient by its stable id (RLS still applies). */
export async function getIngredientById(id: string): Promise<IngredientRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('ingredient_id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IngredientRow | null) ?? null;
}
