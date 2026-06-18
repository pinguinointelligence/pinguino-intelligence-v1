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

const TABLE = 'mapper_basement';

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
