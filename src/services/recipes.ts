/**
 * Saved-recipes service (Phase 2A.2) — the ONLY Supabase access for recipes.
 *
 * RLS scopes every row to the signed-in user (`auth.uid() = user_id`); the client
 * sends the user's JWT (anon key only — never the privileged server key). UI/stores
 * reach these functions (or their TanStack hooks), never the client directly.
 */
import { supabase } from '@/lib/supabase/client';
import { emptyUnconfiguredRead } from '@/services/backendGuard';
import { getCurrentUser } from '@/services/auth';
import type {
  SavedRecipe,
  SavedRecipeVersionRef,
  SaveRecipeInput,
} from '@/features/recipes/recipePayload';

const TABLE = 'saved_recipes';
const UNAVAILABLE = 'Saving is not available in this build.';

/**
 * All recipes owned by the current user (RLS enforces ownership), each carrying its FULL immutable
 * version history (newest first) plus the newest version's number and timestamp.
 *
 * Owner defect v1.4: the library used to date a row by `saved_recipes.updated_at`, which the
 * aggregate also bumps for non-content operations (rename), while the „Wersje" tab dates the same
 * recipe by its version rows. Two clocks for one recipe. „ZAKTUALIZOWANO" means „when did this
 * recipe last get saved", and a save IS a version, so the version history is the authority; the
 * mutable row's timestamp is only the fallback for a legacy orphan with no version at all.
 *
 * The WERSJA selector needs every version, not just the newest — so this reads them in ONE batched
 * `.in(recipe_id, …)` query for the whole page. Two queries total regardless of how many recipes
 * are listed; never one per row.
 */
export async function listMine(): Promise<SavedRecipe[]> {
  if (!supabase) return emptyUnconfiguredRead('recipes.listMine', []);
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SavedRecipe[];
  if (rows.length === 0) return rows;

  const { data: versions, error: versionsError } = await supabase
    .from('recipe_versions')
    .select('recipe_id,version_number,created_at')
    .in(
      'recipe_id',
      rows.map((row) => row.id),
    )
    .order('version_number', { ascending: false });
  // An unreadable history must never hide the recipes themselves — the rows still render, dated by
  // the aggregate, and the failure is reported rather than swallowed silently.
  if (versionsError) {
    console.warn('[GELLATTI] recipes.listMine: version history unavailable', versionsError.message);
    return rows;
  }

  const byRecipe = new Map<string, SavedRecipeVersionRef[]>();
  for (const row of (versions ?? []) as Array<{
    recipe_id: string;
    version_number: number;
    created_at: string;
  }>) {
    const list = byRecipe.get(row.recipe_id) ?? [];
    list.push({ versionNumber: row.version_number, createdAt: row.created_at });
    byRecipe.set(row.recipe_id, list);
  }
  return rows.map((row) => {
    // Newest first — the DB order is already descending, but the selector's contract does not
    // depend on the transport preserving it.
    const history = (byRecipe.get(row.id) ?? [])
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber);
    const newest = history[0];
    return newest
      ? {
          ...row,
          versions: history,
          latest_version_number: newest.versionNumber,
          latest_version_at: newest.createdAt,
        }
      : row;
  });
}

export async function get(id: string): Promise<SavedRecipe | null> {
  if (!supabase) return emptyUnconfiguredRead('recipes.get', null);
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
    .maybeSingle();
  if (error) throw new Error(error.message);
  // No row updated → the id is stale / deleted / not owned (e.g. a reloaded
  // session). Create a fresh recipe instead of failing the save.
  if (!data) return create(payload);
  return data as SavedRecipe;
}

export async function remove(id: string): Promise<void> {
  if (!supabase) throw new Error(UNAVAILABLE);
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}
