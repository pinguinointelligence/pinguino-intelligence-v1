/**
 * Saved-recipes service (Phase 2A.2) — the ONLY Supabase access for recipes.
 *
 * RLS scopes every row to the signed-in user (`auth.uid() = user_id`); the client
 * sends the user's JWT (anon key only — never the privileged server key). UI/stores
 * reach these functions (or their TanStack hooks), never the client directly.
 */
import { supabase } from '@/lib/supabase/client';
import { getCurrentUser } from '@/services/auth';
import type { SavedRecipe, SaveRecipeInput } from '@/features/recipes/recipePayload';

const TABLE = 'saved_recipes';
const UNAVAILABLE = 'Saving is not available in this build.';

/** All recipes owned by the current user (RLS enforces ownership). */
export async function listMine(): Promise<SavedRecipe[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedRecipe[];
}

export async function get(id: string): Promise<SavedRecipe | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SavedRecipe | null) ?? null;
}

export async function create(payload: SaveRecipeInput): Promise<SavedRecipe> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const user = await getCurrentUser();
  if (!user) throw new Error('You must be signed in to save.');
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SavedRecipe;
}

export async function update(id: string, payload: SaveRecipeInput): Promise<SavedRecipe> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SavedRecipe;
}

export async function remove(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
